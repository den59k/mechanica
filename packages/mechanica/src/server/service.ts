import fs from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type {
  ComposedBlockDefinition,
  EditorHostConfig,
  PageFormInput,
  SavePageRequest,
  SiteManifest,
} from 'mechanica-shared'
import {
  createPage,
  duplicatePage,
  deletePage,
  savePage,
  renamePage,
  setPageDraft,
  movePage,
  listPages,
  listFolders,
  pageVersion,
  createTranslation,
  deleteTranslation,
  PageExistsError,
} from './pages-store'
import { saveUpload, saveDerivedAsset, listImages } from './assets-store'
import { resolveDevQuery } from './query-dev'
import {
  mergeSiteData,
  mergeFolderData,
  mergeLocaleSiteData,
  mergeLocaleFolderData,
  folderOf,
} from './data-store'
import { buildPageState, buildGeneratedState } from './page-state'
import {
  listComposedBlocks,
  readComposedBlock,
  createComposedBlock,
  saveComposedBlock,
  deleteComposedBlock,
  composedVersion,
  ComposedBlockExistsError,
} from './composed-store'
import { configureSite, indexGeneratedPages, type GeneratedIndex } from './site'
import { renderEditablePage } from './editor-page'

/** What `/blocks` reports per block — enough for the thumbs CLI to walk them. */
export interface BlockListing {
  id: string
  name: string
  hidden?: boolean
}

export interface EditorServiceOptions {
  /**
   * What the site's code offers (see `SiteManifest`): its blocks — for the
   * rich-text conversion, schema defaults and image metadata of every page
   * read and write — its locales, and its generated pages. A function is
   * called on every request, so a dev server can hand out a fresh manifest
   * after the code changed; the stores are reconfigured whenever it returns a
   * different object. Without it pages are read and written as they are on
   * disk and the site is single-language.
   */
  site?: SiteManifest | (() => SiteManifest | Promise<SiteManifest>)
  /**
   * The page template of the site's editor build (`readEditorTemplate`) —
   * enables {@link EditorService.page}. A function is called per page.
   */
  editorHtml?: string | (() => string | Promise<string>)
  /** How the pages this service renders configure their editor (`window.__MECHANICA_EDITOR__`). */
  hostConfig?: EditorHostConfig
}

/**
 * The editor API of one site: page CRUD, asset upload/serve, folder list, query
 * resolution and composed blocks, all against a `.mech` directory. It speaks
 * web-standard `Request` → `Response` and knows nothing of Vite or any HTTP
 * framework, so the dev server (through `toNodeMiddleware`) and a hosted
 * editing service run the very same code. The wire shapes are
 * `mechanica-shared`'s `editor-protocol.ts`; the client is the editor's
 * `lib/backend.ts`.
 */
export interface EditorService {
  /**
   * Answer a request whose URL path is already relative to the API prefix
   * (`/pages`, not `/@mechanica/pages`). Resolves to `null` for a route this
   * service doesn't own, so the host can fall through.
   */
  handle(request: Request): Promise<Response | null>
  /**
   * The editable HTML page for a site URL path (`/about`, `/ru/blog/2`): the
   * editor build's template with that page's state injected. Resolves to
   * `null` when the service has no `editorHtml`. The host serves the template's
   * sibling files (`dist/mechanica-editor/`) as static files and calls this
   * for everything else outside the API prefix.
   */
  page(urlPath: string): Promise<Response | null>
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

/** Content types of the files a site stores — browsers don't sniff SVG or fonts. */
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Stream a file from `dir`, containing the resolved path so an encoded `..`
 * (or an absolute path) cannot escape it.
 */
function serveFile(dir: string, relative: string, headers: Record<string, string> = {}): Response {
  let decoded: string
  try {
    decoded = decodeURIComponent(relative)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const file = resolve(dir, decoded)
  if (file !== dir && !file.startsWith(dir + sep)) return new Response('Forbidden', { status: 403 })
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 })
  const type = MIME[extname(file).toLowerCase()]
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: { ...(type ? { 'content-type': type } : {}), ...headers },
  })
}

/** A safe composed-block id — a filename component, never a path (no traversal). */
function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)
}

/** Validate an incoming composed-block definition; returns a field-error map or null. */
function validateComposed(def: unknown): Record<string, string> | null {
  if (!def || typeof def !== 'object') return { def: 'Invalid definition' }
  const d = def as Record<string, unknown>
  if (typeof d.id !== 'string' || !isValidId(d.id)) return { id: 'A valid id is required' }
  if (typeof d.name !== 'string' || d.name === '') return { name: 'A name is required' }
  if (d.template !== undefined && !Array.isArray(d.template)) return { template: 'template must be a list' }
  return null
}

/** Create the editor API over a site's `.mech` directory. */
export function createEditorService(mechDir: string, options: EditorServiceOptions = {}): EditorService {
  // The manifest the stores are configured with, and its generated-page index
  // (routes without a file: served for `/state`, listed, rejected on writes).
  let configured: SiteManifest | null = null
  let generatedIndex: GeneratedIndex | null = null
  const currentSite = async (): Promise<SiteManifest | null> => {
    if (!options.site) return null
    const manifest = typeof options.site === 'function' ? await options.site() : options.site
    if (manifest !== configured) {
      configureSite(mechDir, manifest)
      generatedIndex = indexGeneratedPages(manifest)
      configured = manifest
    }
    return manifest
  }

  const route = async (request: Request): Promise<Response | null> => {
    const site = await currentSite()
    const config = site?.locales ?? null
    const gen = site ? generatedIndex : null

    /** Resolve a `locale` query param to a variant code (undefined = base/default). */
    const variantCode = (raw: string | null): string | undefined =>
      config && raw && raw !== config.default && config.all.includes(raw) ? raw : undefined

    const url = new URL(request.url)
    const { pathname } = url
    const query = url.searchParams
    const method = request.method
    const body = <T>() => request.json() as Promise<T>

    /** The rejection for a mutation targeting a file-less generated page, if it is one. */
    const generatedGuard = (path: string | null): Response | null =>
      path && gen?.logical.has(path) ? json({ error: 'This page is generated and read-only' }, 409) : null

    if (pathname.startsWith('/assets/')) {
      return serveFile(resolve(mechDir, 'assets'), pathname.slice('/assets/'.length))
    }
    if (pathname.startsWith('/thumbs/')) {
      // Regenerated in place by `mechanica thumbs` — always revalidate.
      return serveFile(resolve(mechDir, 'thumbs'), pathname.slice('/thumbs/'.length), { 'cache-control': 'no-cache' })
    }

    if (pathname === '/images' && method === 'GET') return json(listImages(mechDir))
    if (pathname === '/folders' && method === 'GET') return json(listFolders(mechDir))

    if (pathname === '/query' && method === 'GET') {
      const key = query.get('q')
      if (!key) return json({ error: 'Missing query key' }, 400)
      // `page` selects the chunk of a paginated query (variant URLs like /blog/2);
      // `locale` scopes a `getPages` listing to a translation.
      const page = Number(query.get('page') ?? '') || undefined
      return json(
        await resolveDevQuery(mechDir, key, { page, locale: variantCode(query.get('locale')) }, gen?.pages),
      )
    }

    if (pathname === '/upload' && method === 'POST') {
      const bytes = Buffer.from(await request.arrayBuffer())
      const header = request.headers.get('x-file-name') ?? 'file'
      // The client percent-encodes the name so spaces/unicode survive the header.
      let name = header
      try {
        name = decodeURIComponent(header)
      } catch {
        /* malformed encoding — keep the raw header value */
      }
      // `x-derived-asset` marks a cropped derivative: written verbatim under
      // the deterministic name the client computed, kept out of the library.
      if (request.headers.get('x-derived-asset')) return json(await saveDerivedAsset(mechDir, name, bytes))
      return json(await saveUpload(mechDir, name, bytes))
    }

    if (pathname === '/state' && method === 'GET') {
      const pathParam = query.get('path')
      if (!pathParam) return json({ error: 'Missing path' }, 400)
      const generated = gen?.byServed.get(pathParam)
      if (generated) return json(buildGeneratedState(mechDir, generated, config))
      return json(buildPageState(mechDir, pathParam, config))
    }

    if (pathname === '/pages' && method === 'GET') {
      return json(listPages(mechDir, { ...(config ? { locales: config } : {}), generated: gen?.pages }))
    }

    if (pathname === '/blocks' && method === 'GET') {
      if (!site) return json({ error: 'Block listing unavailable' }, 503)
      return json(site.blocks.map(({ id, name, hidden }): BlockListing => ({ id, name, hidden })))
    }

    if (pathname === '/pages' && method === 'DELETE') {
      const pathParam = query.get('path')
      if (!pathParam) return json({ error: 'Missing path' }, 400)
      return generatedGuard(pathParam) ?? json({ success: deletePage(mechDir, pathParam) })
    }

    if (pathname === '/pages/draft' && method === 'POST') {
      const pathParam = query.get('path')
      if (!pathParam) return json({ error: 'Missing path' }, 400)
      const blocked = generatedGuard(pathParam)
      if (blocked) return blocked
      const { draft } = await body<{ draft?: boolean }>()
      setPageDraft(mechDir, pathParam, draft === true, variantCode(query.get('locale')))
      return json({ success: true, draft: draft === true })
    }

    // Create a translation of a page (seeded from the default-locale content)
    // or delete one. The base (default-locale) page is a normal page file.
    if (pathname === '/pages/translation' && method === 'POST') {
      const pathParam = query.get('path')
      const locale = query.get('locale')
      if (!pathParam || !locale) return json({ error: 'Missing path or locale' }, 400)
      const blocked = generatedGuard(pathParam)
      if (blocked) return blocked
      if (!config || locale === config.default || !config.all.includes(locale)) {
        return json({ error: 'Unknown locale' }, 400)
      }
      try {
        createTranslation(mechDir, pathParam, locale)
        return json({ success: true })
      } catch (error) {
        if (error instanceof PageExistsError) return json({ error: 'Translation already exists' }, 400)
        throw error
      }
    }

    if (pathname === '/pages/translation' && method === 'DELETE') {
      const pathParam = query.get('path')
      const locale = query.get('locale')
      if (!pathParam || !locale) return json({ error: 'Missing path or locale' }, 400)
      return generatedGuard(pathParam) ?? json({ success: deleteTranslation(mechDir, pathParam, locale) })
    }

    if (pathname === '/pages/duplicate' && method === 'POST') {
      const pathParam = query.get('path')
      if (!pathParam) return json({ error: 'Missing path' }, 400)
      const blocked = generatedGuard(pathParam)
      if (blocked) return blocked
      const input = await body<PageFormInput>()
      if (!input.path || !input.name) return json({ error: 'path and name are required' }, 400)
      try {
        return json(duplicatePage(mechDir, pathParam, input))
      } catch (error) {
        if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
        throw error
      }
    }

    if (pathname === '/pages' && method === 'POST') {
      const input = await body<Partial<PageFormInput>>()
      const pathParam = query.get('path')
      if (pathParam) {
        const blocked = generatedGuard(pathParam)
        if (blocked) return blocked
        // Editing an existing page: optionally move it (new path) and/or rename it.
        try {
          const wantsMove = typeof input.path === 'string' && input.path.trim() && input.path.trim() !== pathParam
          const path = wantsMove ? movePage(mechDir, pathParam, input.path!).path : pathParam
          if (input.name) renamePage(mechDir, path, input.name)
          return json({ success: true, path })
        } catch (error) {
          if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
          throw error
        }
      }
      if (!input.path || !input.name) return json({ error: 'path and name are required' }, 400)
      // Reject a page whose first URL segment names a non-default locale — it
      // would be shadowed by the locale-prefix routing (`/ru` ≡ the ru home).
      if (config) {
        const prefix = typeof input.folderId === 'string' ? `${input.folderId}/` : ''
        const first = `${prefix}${String(input.path).trim()}`.replace(/^\/+/, '').split('/')[0]
        if (first && first !== config.default && config.all.includes(first)) {
          return json({ error: { path: `"/${first}" is reserved for the ${first} locale` } }, 400)
        }
      }
      try {
        return json(createPage(mechDir, input as Parameters<typeof createPage>[1]))
      } catch (error) {
        if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
        throw error
      }
    }

    if (pathname === '/save' && method === 'POST') {
      const pathParam = query.get('path')
      if (!pathParam) return json({ error: 'Missing path' }, 400)
      // Generated pages (plugin `generatePages`) have no file — reject a save
      // rather than writing a stray `.page.md` at their path.
      const blocked = generatedGuard(pathParam)
      if (blocked) return blocked
      // A non-default `locale` writes to that translation's variant file; the
      // default locale (or i18n off) writes the base page.
      const locale = variantCode(query.get('locale'))
      const save = await body<Partial<SavePageRequest>>()
      // Optimistic concurrency: the editor sends back the version it loaded.
      // A mismatch means the file changed externally (e.g. Claude edited the
      // .page.md) — reject instead of overwriting; `force: true` overrides.
      if (!save.force && typeof save.version === 'string') {
        const current = pageVersion(mechDir, pathParam, locale)
        if (current != null && current !== save.version) {
          return json({ error: 'conflict', version: current }, 409)
        }
      }
      // The editor pre-splits data into scope buckets; persist each to its store.
      // Page overrides replace the page's data. Shared (non-`localized`) site/
      // folder data goes to the base files; `localized` entries (siteDataI18n /
      // folderDataI18n) go to the current locale's override file — or the base
      // when editing the default locale.
      const folder = folderOf(mechDir, pathParam)
      const version = savePage(
        mechDir,
        pathParam,
        { content: save.content as never, data: save.pageData ?? {}, layout: save.layout },
        locale,
      )
      const siteI18n = save.siteDataI18n ?? {}
      const folderI18n = save.folderDataI18n ?? {}
      if (locale) {
        mergeSiteData(mechDir, save.siteData ?? {})
        mergeFolderData(mechDir, folder, save.folderData ?? {})
        mergeLocaleSiteData(mechDir, locale, siteI18n)
        mergeLocaleFolderData(mechDir, locale, folder, folderI18n)
      } else {
        mergeSiteData(mechDir, { ...(save.siteData ?? {}), ...siteI18n })
        mergeFolderData(mechDir, folder, { ...(save.folderData ?? {}), ...folderI18n })
      }
      return json({ success: true, version })
    }

    // ── Composed blocks (Block Composer) ─────────────────────────────────
    if (pathname === '/composed' && method === 'GET') return json(listComposedBlocks(mechDir))

    if (pathname === '/composed/get' && method === 'GET') {
      const id = query.get('id')
      if (!id || !isValidId(id)) return json({ error: 'Missing or invalid id' }, 400)
      const result = readComposedBlock(mechDir, id)
      return result ? json(result) : json({ error: 'not found' }, 404)
    }

    if (pathname === '/composed/create' && method === 'POST') {
      const def = await body<ComposedBlockDefinition>()
      const invalid = validateComposed(def)
      if (invalid) return json({ error: invalid }, 400)
      // Reject an id already used by a compiled or composed block
      // (`createComposedBlock` also guards against an existing file).
      if (site?.blocks.some((block) => block.id === def.id)) {
        return json({ error: { id: 'A block with this id already exists' } }, 400)
      }
      try {
        return json({ success: true, ...createComposedBlock(mechDir, def) })
      } catch (error) {
        if (error instanceof ComposedBlockExistsError) {
          return json({ error: { id: 'A block with this id already exists' } }, 400)
        }
        throw error
      }
    }

    if (pathname === '/composed/save' && method === 'POST') {
      const id = query.get('id')
      if (!id || !isValidId(id)) return json({ error: 'Missing or invalid id' }, 400)
      const save = await body<{ def: ComposedBlockDefinition; version?: string; force?: boolean }>()
      const invalid = validateComposed(save.def)
      if (invalid) return json({ error: invalid }, 400)
      // Optimistic concurrency: reject a save over an external edit (a 409),
      // like the page save path — `force: true` overrides.
      if (!save.force && typeof save.version === 'string') {
        const current = composedVersion(mechDir, id)
        if (current != null && current !== save.version) return json({ error: 'conflict', version: current }, 409)
      }
      return json({ success: true, ...saveComposedBlock(mechDir, id, save.def) })
    }

    if (pathname === '/composed/delete' && method === 'POST') {
      const id = query.get('id')
      if (!id || !isValidId(id)) return json({ error: 'Missing or invalid id' }, 400)
      return json({ success: deleteComposedBlock(mechDir, id) })
    }

    return null
  }

  return {
    async handle(request) {
      try {
        return await route(request)
      } catch (error) {
        return json({ error: String(error) }, 500)
      }
    },
    async page(urlPath) {
      if (!options.editorHtml) return null
      const site = await currentSite()
      const template = typeof options.editorHtml === 'function' ? await options.editorHtml() : options.editorHtml
      const generated = site ? generatedIndex?.byServed.get(urlPath) : undefined
      const locales = site?.locales ?? null
      const state = generated
        ? buildGeneratedState(mechDir, generated, locales)
        : buildPageState(mechDir, urlPath, locales)
      const html = renderEditablePage(template, state, { site: site?.site, hostConfig: options.hostConfig })
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
    },
  }
}
