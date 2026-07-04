import fs from 'node:fs'
import { resolve, sep } from 'node:path'
import type { Connect } from 'vite'
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
  PageExistsError,
} from './pages-store'
import { saveUpload, saveDerivedAsset, listImages } from './assets-store'
import { resolveDevQuery } from './query-dev'
import { mergeSiteData, mergeFolderData, folderOf } from './data-store'
import { buildPageState } from './page-state'
import {
  listComposedBlocks,
  readComposedBlock,
  createComposedBlock,
  saveComposedBlock,
  deleteComposedBlock,
  composedVersion,
  ComposedBlockExistsError,
} from './composed-store'
import type { ComposedBlockDefinition } from 'mechanica-shared'

/** What `/blocks` reports per block — enough for the thumbs CLI to walk them. */
export interface BlockListing {
  id: string
  name: string
  hidden?: boolean
}

export interface DevMiddlewareOptions {
  /** Awaited before serving `/state`, so richText fields convert consistently. */
  ready?: () => Promise<void> | void
  /** Lists the project's blocks (for `mechanica thumbs --blocks`). */
  blocks?: () => Promise<BlockListing[]> | BlockListing[]
}

/**
 * The `/@mechanica` dev middleware: page CRUD, asset upload/serve, folder list,
 * and query resolution against the local `.mech` store. Mounted under the
 * `/@mechanica` prefix, so `req.url` here is already prefix-stripped.
 */
export function createDevMiddleware(
  mechDir: string,
  options: DevMiddlewareOptions = {},
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url
    const query = url.searchParams

    const json = (data: unknown, status = 200) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(data))
    }

    /**
     * Stream a file from a directory under `.mech`, containing the resolved
     * path so an encoded `..` (or an absolute path) cannot escape it.
     */
    const serveFrom = (dirName: string, prefix: string) => {
      const dir = resolve(mechDir, dirName)
      const file = resolve(dir, decodeURIComponent(pathname.slice(prefix.length)))
      if (file !== dir && !file.startsWith(dir + sep)) {
        res.statusCode = 403
        return res.end('Forbidden')
      }
      if (!fs.existsSync(file)) {
        res.statusCode = 404
        return res.end('Not found')
      }
      return fs.createReadStream(file).pipe(res)
    }

    try {
      if (pathname.startsWith('/assets/')) return serveFrom('assets', '/assets/')
      if (pathname.startsWith('/thumbs/')) {
        // Regenerated in place by `mechanica thumbs` — always revalidate.
        res.setHeader('cache-control', 'no-cache')
        return serveFrom('thumbs', '/thumbs/')
      }

      if (pathname === '/images' && req.method === 'GET') return json(listImages(mechDir))
      if (pathname === '/folders' && req.method === 'GET') return json(listFolders(mechDir))

      if (pathname === '/query' && req.method === 'GET') {
        const key = query.get('q')
        if (!key) return json({ error: 'Missing query key' }, 400)
        // `page` selects the chunk of a paginated query (variant URLs like /blog/2).
        const page = Number(query.get('page') ?? '') || undefined
        return json(await resolveDevQuery(mechDir, key, { page }))
      }

      if (pathname === '/upload' && req.method === 'POST') {
        const body = await readBody(req)
        const header = (req.headers['x-file-name'] as string) ?? 'file'
        // The client percent-encodes the name so spaces/unicode survive the header.
        let name = header
        try {
          name = decodeURIComponent(header)
        } catch {
          /* malformed encoding — keep the raw header value */
        }
        // `x-derived-asset` marks a cropped derivative: written verbatim under
        // the deterministic name the client computed, kept out of the library.
        if (req.headers['x-derived-asset']) return json(await saveDerivedAsset(mechDir, name, body))
        return json(await saveUpload(mechDir, name, body))
      }

      if (pathname === '/state' && req.method === 'GET') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        await options.ready?.()
        return json(buildPageState(mechDir, pathParam))
      }

      if (pathname === '/pages' && req.method === 'GET') return json(listPages(mechDir))

      if (pathname === '/blocks' && req.method === 'GET') {
        if (!options.blocks) return json({ error: 'Block listing unavailable' }, 503)
        return json(await options.blocks())
      }

      if (pathname === '/pages' && req.method === 'DELETE') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        return json({ success: deletePage(mechDir, pathParam) })
      }

      if (pathname === '/pages/draft' && req.method === 'POST') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        setPageDraft(mechDir, pathParam, body.draft === true)
        return json({ success: true, draft: body.draft === true })
      }

      if (pathname === '/pages/duplicate' && req.method === 'POST') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        if (!body.path || !body.name) return json({ error: 'path and name are required' }, 400)
        try {
          return json(duplicatePage(mechDir, pathParam, body))
        } catch (error) {
          if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
          throw error
        }
      }

      if (pathname === '/pages' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        const pathParam = query.get('path')
        if (pathParam) {
          // Editing an existing page: optionally move it (new path) and/or rename it.
          try {
            const wantsMove = typeof body.path === 'string' && body.path.trim() && body.path.trim() !== pathParam
            const path = wantsMove ? movePage(mechDir, pathParam, body.path).path : pathParam
            if (body.name) renamePage(mechDir, path, body.name)
            return json({ success: true, path })
          } catch (error) {
            if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
            throw error
          }
        }
        if (!body.path || !body.name) return json({ error: 'path and name are required' }, 400)
        try {
          return json(createPage(mechDir, body))
        } catch (error) {
          if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
          throw error
        }
      }

      if (pathname === '/save' && req.method === 'POST') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        // Optimistic concurrency: the editor sends back the version it loaded.
        // A mismatch means the file changed externally (e.g. Claude edited the
        // .page.md) — reject instead of overwriting; `force: true` overrides.
        if (!body.force && typeof body.version === 'string') {
          const current = pageVersion(mechDir, pathParam)
          if (current != null && current !== body.version) {
            return json({ error: 'conflict', version: current }, 409)
          }
        }
        // The editor pre-splits data into scope buckets; persist each to its store.
        // Page overrides replace the page's data; site/folder merge into shared files.
        const version = savePage(mechDir, pathParam, { content: body.content, data: body.pageData ?? {} })
        mergeSiteData(mechDir, body.siteData ?? {})
        mergeFolderData(mechDir, folderOf(mechDir, pathParam), body.folderData ?? {})
        return json({ success: true, version })
      }

      // ── Composed blocks (Block Composer) ─────────────────────────────────
      if (pathname === '/composed' && req.method === 'GET') return json(listComposedBlocks(mechDir))

      if (pathname === '/composed/get' && req.method === 'GET') {
        const id = query.get('id')
        if (!id || !isValidId(id)) return json({ error: 'Missing or invalid id' }, 400)
        const result = readComposedBlock(mechDir, id)
        if (!result) return json({ error: 'not found' }, 404)
        return json(result)
      }

      if (pathname === '/composed/create' && req.method === 'POST') {
        const def = JSON.parse((await readBody(req)).toString('utf-8')) as ComposedBlockDefinition
        const invalid = validateComposed(def)
        if (invalid) return json({ error: invalid }, 400)
        // Reject an id already used by a compiled or composed block. Listing
        // blocks can fail (SSR load hiccup) — don't block the create over it;
        // `createComposedBlock` still guards against an existing file.
        const existing = await Promise.resolve()
          .then(() => options.blocks?.())
          .catch(() => [] as BlockListing[])
        if ((existing ?? []).some((block) => block.id === def.id)) {
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

      if (pathname === '/composed/save' && req.method === 'POST') {
        const id = query.get('id')
        if (!id || !isValidId(id)) return json({ error: 'Missing or invalid id' }, 400)
        const body = JSON.parse((await readBody(req)).toString('utf-8')) as {
          def: ComposedBlockDefinition
          version?: string
          force?: boolean
        }
        const invalid = validateComposed(body.def)
        if (invalid) return json({ error: invalid }, 400)
        // Optimistic concurrency: reject a save over an external edit (a 409),
        // like the page save path — `force: true` overrides.
        if (!body.force && typeof body.version === 'string') {
          const current = composedVersion(mechDir, id)
          if (current != null && current !== body.version) return json({ error: 'conflict', version: current }, 409)
        }
        return json({ success: true, ...saveComposedBlock(mechDir, id, body.def) })
      }

      if (pathname === '/composed/delete' && req.method === 'POST') {
        const id = query.get('id')
        if (!id || !isValidId(id)) return json({ error: 'Missing or invalid id' }, 400)
        return json({ success: deleteComposedBlock(mechDir, id) })
      }

      next()
    } catch (error) {
      json({ error: String(error) }, 500)
    }
  }
}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
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
