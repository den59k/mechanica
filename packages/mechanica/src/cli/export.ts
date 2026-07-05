import { readFile, writeFile, mkdir, rm, cp, readdir, copyFile, stat, access } from 'node:fs/promises'
import { dirname, join, parse, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  applySeoTags,
  auditPageHtml,
  buildRobotsTxt,
  buildSitemap,
  findUnknownBlocks,
  generateProject,
  isPaginatedQuery,
  localePath,
  mergeTranslation,
  migrateContent,
  paginationVariantPath,
  registerFieldSchemas,
  resolveQueryKey,
  templateBlockIds,
  validateLinks,
  walkSchema,
  walkTree,
  type Block,
  type ComposedBlockDefinition,
  type LocalesConfig,
  type QuerySource,
  type RenderResult,
  type SitemapEntry,
} from 'mechanica-shared'
import { parsePage, type RichTextCodec } from 'mechanica-shared/page-format'
import { toBlockMeta, composedBlockMeta, type BlockComponent } from '../editor/lib/block-meta'
import {
  assetFileOf,
  isDerivedAsset,
  readImageManifest,
  updateImageManifest,
  UPLOADS_PREFIX,
  type ImageManifest,
  type ImageManifestEntry,
} from '../vite/dev/assets-store'
import { readSiteData, readFoldersData, readFolderData, readSiteLocaleOverride } from '../vite/dev/data-store'
import { analyzeImageBuffer, hasSharp } from '../vite/dev/image-preview'
import { getPagePath, listPages, setPageCodec } from '../vite/dev/pages-store'
import { buildRichTextCodec } from '../vite/rich-text-codec'
import { blockAssetLinks, BLOCKS_MANIFEST_FILE, type BlockChunkRef, type ViteManifest } from './page-assets'
import { runBuild } from './build'

interface ExportPage {
  /** The exported URL path — locale-prefixed for a translation (`/ru/about`). */
  path: string
  /** The canonical (default-locale) path — for breadcrumbs, alternates, pagination. */
  logicalPath: string
  /** The locale this page renders in (undefined = the default locale). */
  locale?: string
  /** Which locales this logical page has (default + translations), for hreflang alternates. */
  translations?: string[]
  content: any[]
  data: Record<string, any>
  /** Editor label — feeds the auto BreadcrumbList names. */
  name?: string
  /** ISO date of the page file's last change (sitemap `<lastmod>`). */
  lastmod?: string
  page?: {
    title?: string
    meta?: Record<string, unknown>
    pagination?: { page: number; pageCount: number }
    /** The locale this page renders in — carried into `state.page.locale`. */
    locale?: string
    /** Which locales this logical page has — carried into `state.page.locales`. */
    locales?: string[]
    /** The logical path for `state.page.path` (a translation keeps its logical, not `/<locale>/`, path). */
    path?: string
  }
}

/** A page filename stem ending in `@<locale>` is a translation, handled per-locale. */
const VARIANT_STEM_RE = /@[A-Za-z][A-Za-z0-9_-]*$/

/** Set `<html lang>` unless the template already declares one (author wins). */
function setHtmlLang(html: string, lang: string): string {
  if (/<html\b[^>]*\blang\s*=/i.test(html)) return html
  return html.replace(/<html\b([^>]*)>/i, `<html$1 lang="${lang}">`)
}

/** Read every page JSON under `<mech>/pages` as an exportable page. */
async function readPages(
  pagesDir: string,
  foldersData: Record<string, Record<string, any>> = {},
  richText?: RichTextCodec,
): Promise<ExportPage[]> {
  let entries: string[]
  try {
    entries = (await readdir(pagesDir, { recursive: true })) as string[]
  } catch {
    return []
  }

  const EXT = '.page.md'
  const pages: ExportPage[] = []
  for (const relative of entries) {
    if (!relative.endsWith(EXT)) continue
    const parsed = parse(relative)
    const dir = parsed.dir.replace(/\\/g, '/')
    const base = parsed.base.slice(0, -EXT.length)
    // Translation files (`about@ru.page.md`) render per-locale, not as own pages.
    if (VARIANT_STEM_RE.test(base)) continue
    const filePath = join(pagesDir, relative)
    const file = parsePage(await readFile(filePath, 'utf-8'), richText ? { richText } : undefined)
    // Draft pages are dev-only: never rendered, never in the sitemap.
    if (file.draft) continue
    const path = `/${dir}/${base === 'index' ? '' : base}`.replace('//', '/').replace(/\/$/, '') || '/'
    // Fold this page's folder-scoped data in; site data is applied via projectData.
    const data = { ...(dir ? foldersData[dir] : undefined), ...(file.data ?? {}) }
    // `meta.lastmod` overrides the file mtime — CI checkouts reset mtimes.
    const lastmod =
      typeof file.meta?.lastmod === 'string'
        ? file.meta.lastmod
        : await stat(filePath).then((s) => s.mtime.toISOString().slice(0, 10)).catch(() => undefined)
    // The static-host 404 page is never a search result — noindex it.
    const meta = path === '/404' ? { noindex: true, ...file.meta } : file.meta
    pages.push({ path, logicalPath: path, content: file.content ?? [], data, name: file.name, lastmod, page: { meta } })
  }
  return pages
}

/**
 * Read a page's translation for `locale`, returning an {@link ExportPage} at the
 * locale-prefixed path — or `null` when the translation file is missing or is a
 * per-locale draft. Content/data come from the variant file; folder-scoped data
 * merges the same as the base page.
 */
async function readTranslation(
  mechDir: string,
  base: ExportPage,
  locale: string,
  config: LocalesConfig,
  richText?: RichTextCodec,
): Promise<ExportPage | null> {
  const file = getPagePath(mechDir, base.logicalPath, locale)
  let raw: string
  try {
    raw = await readFile(file, 'utf-8')
  } catch {
    return null
  }
  const doc = parsePage(raw, richText ? { richText } : undefined)
  if (doc.draft) return null
  const rel = relative(join(mechDir, 'pages'), file).replace(/\\/g, '/')
  const dir = dirname(rel) === '.' ? '' : dirname(rel)
  // Overlay the sparse translation on the default-locale page: the base owns the
  // block structure, and shared fields (images, links, colors) the translation
  // doesn't override inherit — exactly like the dev server's buildPageState.
  let content = doc.content ?? []
  let pageData = doc.data ?? {}
  let pageMeta = doc.meta
  try {
    const baseDoc = parsePage(
      await readFile(getPagePath(mechDir, base.logicalPath), 'utf-8'),
      richText ? { richText } : undefined,
    )
    const merged = mergeTranslation(
      { content: baseDoc.content ?? [], data: baseDoc.data ?? {}, meta: baseDoc.meta ?? {} },
      { content: doc.content ?? [], data: doc.data ?? {}, meta: doc.meta ?? {} },
    )
    content = merged.content
    pageData = merged.data
    pageMeta = merged.meta
  } catch {
    // No base file (a standalone translation) — render the translation as-is.
  }
  // `localized` shared data: fold this locale's folder override (over the base
  // folder data) and site override in, so translated nav/footer strings render.
  // Precedence stays site < folder < page (base site rides `projectData`).
  const folderData = readFolderData(mechDir, dir || null, locale)
  const siteOverride = readSiteLocaleOverride(mechDir, locale)
  const data = { ...siteOverride, ...folderData, ...pageData }
  const lastmod =
    typeof doc.meta?.lastmod === 'string'
      ? doc.meta.lastmod
      : await stat(file).then((s) => s.mtime.toISOString().slice(0, 10)).catch(() => undefined)
  const meta = base.logicalPath === '/404' ? { noindex: true, ...pageMeta } : pageMeta
  return {
    path: localePath(base.logicalPath, locale, config),
    logicalPath: base.logicalPath,
    locale,
    content,
    data,
    name: doc.name ?? base.name,
    lastmod,
    // `state.page.path` stays the *logical* path (not the /<locale>/ export path)
    // so `<Link>` / `usePagination().pathFor` prefix it for the locale exactly
    // like the dev server does — otherwise they'd double-prefix.
    page: { meta, locale, path: base.logicalPath },
  }
}

/**
 * The breadcrumb trail for a path — every ancestor (root first, the page last)
 * that actually exists as a page, named by its editor label. Feeds the auto
 * BreadcrumbList JSON-LD.
 */
function breadcrumbsFor(path: string, names: Map<string, string>): { name: string; path: string }[] {
  if (path === '/') return []
  const trail = ['/']
  let current = ''
  for (const segment of path.slice(1).split('/')) {
    current += `/${segment}`
    trail.push(current)
  }
  return trail.filter((p) => names.has(p)).map((p) => ({ name: names.get(p)!, path: p }))
}

/** An already-built SSR bundle (`dist/ssr.js`) exposes these. */
export interface SsrBundle {
  /**
   * Render a page state to HTML. Newer bundles take a context with a
   * `resolveQuery` and return `{ html, query }` (the queries the render
   * resolved); plain-string returns are still accepted.
   */
  render: (
    state: any,
    context?: { resolveQuery?: (key: string) => Promise<unknown> | unknown },
  ) => Promise<RenderResult> | RenderResult
  blocksList: BlockComponent[]
  /** Composed-block definitions (from `virtual:mechanica/composed`). */
  composedList?: ComposedBlockDefinition[]
  dataEntries?: { id: string; props: any }[]
  /** Site identity baked in from the plugin's `siteUrl` / `siteName` options. */
  site?: { url?: string; name?: string }
  /** The site's locale config baked in from the plugin's `locales` option. */
  locales?: LocalesConfig | null
}

export interface ExportOptions {
  /**
   * Absolute site origin (e.g. `https://example.com`) — enables sitemap.xml,
   * robots.txt and the URL-based SEO tags (canonical, og:url, …). Overrides
   * the plugin's `siteUrl` option baked into the SSR bundle.
   */
  siteUrl?: string
  /** Site display name (WebSite JSON-LD). Overrides the plugin's `siteName`. */
  siteName?: string
  /** Warning sink (broken links, orphaned assets). Defaults to `console.warn`. */
  onWarn?: (message: string) => void
}

/**
 * Load the pieces needed to preload per-page block chunks: the client build's
 * Vite manifest and the plugin's block map. Older builds (or builds outside
 * `mechanica build`) may not have them — links are simply skipped then.
 */
async function readBlockAssets(
  cwd: string,
): Promise<{ manifest: ViteManifest; blockFiles: Record<string, BlockChunkRef> } | null> {
  try {
    const [manifest, blockFiles] = await Promise.all([
      readFile(join(cwd, 'dist/.vite/manifest.json'), 'utf-8').then(JSON.parse),
      readFile(join(cwd, 'dist', BLOCKS_MANIFEST_FILE), 'utf-8').then(JSON.parse),
    ])
    return { manifest, blockFiles }
  } catch {
    return null
  }
}

/** Where uploaded assets land in the static export. */
const MEDIA_DIR = 'media'

/** An image field value, as stored in page data. */
interface ImageFieldValue {
  src: string
  previewSrc?: string
  width?: number
  height?: number
}

/** Fill a value's missing preview/dimensions from a manifest entry. */
function fillImageValue(value: ImageFieldValue, entry: ImageManifestEntry): void {
  if (entry.previewSrc && (!value.previewSrc || value.previewSrc === value.src)) {
    value.previewSrc = entry.previewSrc
  }
  if (entry.width && !value.width) value.width = entry.width
  if (entry.height && !value.height) value.height = entry.height
}

/**
 * Fill missing image metadata — LQIP `previewSrc` + intrinsic dimensions —
 * into the state being exported (page files are never touched). Sources, in
 * order: the `.mech/images.json` manifest (written by uploads, editor saves
 * and `mechanica images`), then the optional `sharp` dependency for anything
 * still missing — those computed entries are cached back into the manifest.
 * Without sharp, leftover gaps get a one-time hint.
 */
async function backfillImageMeta(
  pages: ExportPage[],
  blocksMap: Map<string, Block>,
  mechDir: string,
  warn: (message: string) => void,
): Promise<void> {
  const manifest = readImageManifest(mechDir)
  const incomplete = new Map<string, ImageFieldValue[]>()
  for (const page of pages) {
    walkTree(page.content, (block) => {
      const meta = blocksMap.get(block.blockId)
      if (!meta) return
      walkSchema(block.data, meta.props, (value: any, schema: any) => {
        if (schema.format !== 'image') return
        const file = assetFileOf(value?.src)
        if (!file) return
        const entry = manifest[file]
        if (entry) fillImageValue(value, entry)
        if (!value.previewSrc || value.previewSrc === value.src || !value.width || !value.height) {
          incomplete.set(file, [...(incomplete.get(file) ?? []), value])
        }
      })
    })
  }
  if (!incomplete.size) return

  if (!(await hasSharp())) {
    warn(
      `[mechanica] ${incomplete.size} image(s) lack a preview or dimensions — install the ` +
        `optional "sharp" dependency or run \`mechanica images\` to generate them`,
    )
    return
  }

  // One decode per distinct file, shared across every value referencing it;
  // computed entries are cached into the manifest for dev and future exports.
  const computed: ImageManifest = {}
  for (const [file, values] of incomplete) {
    const buffer = await readFile(join(mechDir, 'assets', file)).catch(() => null)
    const info = buffer ? await analyzeImageBuffer(buffer) : null
    if (!info) continue
    computed[file] = info
    for (const value of values) fillImageValue(value, info)
  }
  updateImageManifest(mechDir, computed)
}

/**
 * Statically render every page of an already-built project into `export/`,
 * returning the generated page paths. This is the post-build core of
 * {@link runExport}, isolated so it can be tested without a Vite build: it
 * expects `<cwd>/dist` (index.html, assets, the loaded `ssr` bundle) and that
 * field schemas have been registered; it reads pages + scoped data from
 * `<cwd>/.mech`.
 *
 * Beyond the pages it also: rewrites + copies uploaded assets
 * (`/@mechanica/assets/…` → `/media/…`), warns about dead internal links,
 * orphaned uploads and page-level SEO issues, emits `404.html` when a `/404`
 * page exists, and — when a site url is known (plugin `siteUrl` option or
 * `--site-url`) — injects the automatic SEO tags (canonical, `og:url`,
 * absolute social-image URLs, pagination prev/next, JSON-LD) and emits
 * `sitemap.xml` + `robots.txt`.
 */
export async function exportProject(
  cwd: string,
  ssr: SsrBundle,
  options: ExportOptions = {},
): Promise<string[]> {
  const warn = options.onWarn ?? ((message: string) => console.warn(message))
  const index = await readFile(join(cwd, 'dist/index.html'), 'utf-8')

  // CLI flags win over the site config baked into the SSR bundle.
  const siteUrl = options.siteUrl ?? ssr.site?.url
  const siteName = options.siteName ?? ssr.site?.name

  // Composed blocks join the block set: their (unfolded) schemas fill placed
  // data defaults, and they count as known blocks for link/unknown checks.
  const composedDefs = ssr.composedList ?? []
  const blocks: Block[] = [...ssr.blocksList.map(toBlockMeta), ...composedDefs.map(composedBlockMeta)]
  const blocksMap = new Map(blocks.map((block) => [block.id, block]))
  const composedMap = new Map(composedDefs.map((def) => [def.id, def]))

  const richText = buildRichTextCodec(ssr.blocksList)
  const foldersData = readFoldersData(join(cwd, '.mech'))
  const defaultPages = await readPages(join(cwd, '.mech/pages'), foldersData, richText)
  const projectData = readSiteData(join(cwd, '.mech'))

  // Multi-language: render each translation that exists at its locale-prefixed
  // path. Untranslated pages are skipped (rendering default content at `/ru/…`
  // is an SEO liability) and reported per locale, like the link validator.
  const config = ssr.locales ?? null
  const mechDir = join(cwd, '.mech')
  const pages: ExportPage[] = [...defaultPages]
  if (config) {
    const missing: Record<string, string[]> = {}
    for (const base of defaultPages) {
      const present = [config.default]
      for (const locale of config.all) {
        if (locale === config.default) continue
        const translation = await readTranslation(mechDir, base, locale, config, richText)
        if (translation) {
          present.push(locale)
          pages.push(translation)
        } else if (!base.page?.meta?.noindex) {
          ;(missing[locale] ??= []).push(base.logicalPath)
        }
      }
      // Every locale-variant of a page advertises the same set of alternates.
      base.translations = present
      if (base.page) base.locale = config.default
      base.page = { ...base.page, locale: config.default, locales: present }
    }
    // Back-fill each translation with the shared alternates set (its base's).
    const translationsByLogical = new Map(defaultPages.map((p) => [p.logicalPath, p.translations]))
    for (const page of pages) {
      if (page.locale && page.locale !== config.default) {
        const present = translationsByLogical.get(page.logicalPath)
        page.translations = present
        page.page = { ...page.page, locales: present }
      }
    }
    for (const [locale, paths] of Object.entries(missing)) {
      if (paths.length) {
        warn(
          `[mechanica] locale "${locale}" is missing ${paths.length} translation(s) ` +
            `(rendered only in ${config.default}): ${paths.join(', ')}`,
        )
      }
    }
  }

  // Queries (`usePages`/`usePagination`/`useFetch`) resolve at build time
  // against the same `.mech` store, memoized per (page-number, key) across the
  // whole export — a nav query shared by 100 pages resolves once. The codec is
  // installed so page data read by `listPages` matches what pages render with.
  setPageCodec(richText)
  const querySource: QuerySource = {
    listPages: (opts) => listPages(join(cwd, '.mech'), opts),
    fetchJson: async ({ url, ...init }) => {
      const res = await fetch(url, init as RequestInit)
      if (!res.ok) throw new Error(`${url} responded ${res.status}`)
      return res.json()
    },
  }
  const queryCache = new Map<string, Promise<unknown>>()
  const resolveForPage =
    (pageNumber: number, pageLocale?: string) =>
    (key: string): Promise<unknown> => {
      // A translation resolves `getPages` in its locale (translated data,
      // translated pages only); default-locale pages use the base listing.
      const locale = config && pageLocale && pageLocale !== config.default ? pageLocale : undefined
      const cacheKey = `${pageNumber} ${locale ?? ''} ${key}`
      let hit = queryCache.get(cacheKey)
      if (!hit) {
        hit = resolveQueryKey(querySource, key, { page: pageNumber, locale })
        queryCache.set(cacheKey, hit)
      }
      return hit
    }

  // Upgrade data written with older block schemas, and surface blocks that no
  // longer exist (they render as nothing — usually a renamed/deleted block).
  for (const page of pages) {
    migrateContent(page.content, blocksMap)
    for (const id of findUnknownBlocks(page.content, blocksMap)) {
      warn(`[mechanica] Page ${page.path} references unknown block "${id}" — it renders as nothing`)
    }
  }

  // Dead internal links: warn (not fail) — a target may be served elsewhere.
  for (const issue of validateLinks(pages, blocksMap)) {
    warn(`[mechanica] Broken link on ${issue.page}: ${issue.url} has no matching page`)
  }

  // Fill image metadata (LQIP previews, dimensions) into the exported state:
  // manifest first, optional `sharp` for anything still missing.
  await backfillImageMeta(pages, blocksMap, join(cwd, '.mech'), warn)

  const exportDir = join(cwd, 'export')
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(exportDir, { recursive: true })

  // Ship everything the build produced except its private artifacts: the
  // bundled assets plus whatever Vite copied from `public/` (favicon,
  // robots.txt, fonts, site-verification files) — those must reach the export.
  const DIST_PRIVATE = new Set(['index.html', 'ssr.js', 'ssr.js.map', '.vite', BLOCKS_MANIFEST_FILE])
  const distEntries = (await readdir(join(cwd, 'dist')).catch(() => [])) as string[]
  for (const entry of distEntries) {
    if (DIST_PRIVATE.has(entry)) continue
    await cp(join(cwd, 'dist', entry), join(exportDir, entry), { recursive: true })
  }

  // Uploaded assets (`.mech/assets`): rewrite their dev URLs to `/media/…` and
  // remember which files pages actually reference, so we copy exactly those.
  const referenced = new Set<string>()
  const onFile = (src: string): string => {
    if (typeof src !== 'string' || !src.startsWith(UPLOADS_PREFIX)) return src
    const relative = decodeURIComponent(src.slice(UPLOADS_PREFIX.length))
    referenced.add(relative)
    return `/${MEDIA_DIR}/${relative}`
  }

  // Blocks are code-split in the client build: give each page stylesheet +
  // modulepreload links for exactly the block chunks its content uses.
  const blockAssets = await readBlockAssets(cwd)
  const pageLinks = blockAssets
    ? (content: any[]): string[] => {
        // A placed composed block contributes the compiled blocks its template
        // renders through, so their chunks/CSS preload too (its own id and the
        // element ids have no chunk and are simply skipped by blockAssetLinks).
        const blockIds = new Set<string>()
        const add = (id: string): void => {
          if (blockIds.has(id)) return
          blockIds.add(id)
          const def = composedMap.get(id)
          if (def) for (const inner of templateBlockIds(def)) add(inner)
        }
        walkTree(content, (block) => add(block.blockId))
        return blockAssetLinks({
          blockIds,
          ...blockAssets,
          alreadyLinked: (file) => index.includes(file),
        })
      }
    : undefined

  const projectOptions = {
    index,
    blocksMap,
    dataEntries: ssr.dataEntries ?? [],
    projectData,
    site: { url: siteUrl, name: siteName },
    // Bake the locale config into each page's `state.locales` so the runtime
    // prefixes internal links for `state.page.locale`.
    locales: config ?? undefined,
    // The page number of the variant being rendered rides `state.page.pagination`;
    // its locale rides `state.page.locale` (translated listings resolve per locale).
    render: (state: any) =>
      ssr.render(state, {
        resolveQuery: resolveForPage(state.page?.pagination?.page ?? 1, state.page?.locale),
      }),
    onFile,
    pageLinks,
  }

  const written: string[] = []
  const writePage = async (path: string, html: string): Promise<void> => {
    const dir = path === '/' ? exportDir : join(exportDir, path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), html)
    written.push(path)
  }

  // The automatic SEO output. When the template reads `page.pagination` the
  // author is handling variant titles — the "— Page N" suffix stays off.
  const templateHandlesPagination = index.includes('page.pagination')
  // Breadcrumb names are keyed by logical path (default-locale labels) — a
  // translation reuses its base page's trail.
  const pageNames = new Map(
    defaultPages.map((page) => [
      page.logicalPath,
      page.name ?? (page.logicalPath === '/' ? 'Home' : page.logicalPath.split('/').pop()!),
    ]),
  )

  /** hreflang alternates for a translated page (each locale + x-default), at page N. */
  const alternatesFor = (source: ExportPage, pageNum = 1): { hreflang: string; path: string }[] | undefined => {
    if (!config || !source.translations || source.translations.length < 2) return undefined
    const at = (loc: string) => paginationVariantPath(localePath(source.logicalPath, loc, config), pageNum)
    return [
      { hreflang: 'x-default', path: at(config.default) },
      ...source.translations.map((loc) => ({ hreflang: loc, path: at(loc) })),
    ]
  }

  const finishPage = (
    html: string,
    path: string,
    source: ExportPage,
    pagination?: { page: number; pageCount: number; basePath: string },
  ): string => {
    let out = applySeoTags(html, {
      siteUrl,
      siteName,
      path,
      noindex: source.page?.meta?.noindex === true,
      pagination,
      templateHandlesPagination,
      // A variant is the same logical page — it carries the base page's trail.
      breadcrumbs: breadcrumbsFor(source.logicalPath, pageNames),
      alternates: alternatesFor(source, pagination?.page ?? 1),
    })
    // Set `<html lang>` per locale (unless the template already set it).
    if (config) out = setHtmlLang(out, source.locale ?? config.default)
    return out
  }

  const sitemapEntries: SitemapEntry[] = []
  const recordSitemap = (path: string, source: ExportPage, pageNum = 1): void => {
    if (path === '/404' || source.page?.meta?.noindex === true) return
    sitemapEntries.push({ path, lastmod: source.lastmod, alternates: alternatesFor(source, pageNum) })
  }

  // First pass: every real page. A paginated query (`usePagination`) with more
  // than one chunk marks the page for splitting into `/path/2` … `/path/N`.
  const knownPaths = new Set(pages.map((page) => page.path))
  const pageByPath = new Map(pages.map((page) => [page.path, page]))
  const variants: ExportPage[] = []
  const titlePages = new Map<string, string[]>()
  for await (const { html, path, query } of generateProject({ ...projectOptions, pages })) {
    const source = pageByPath.get(path)!

    let pageCount = 1
    for (const [key, result] of Object.entries(query)) {
      if (!isPaginatedQuery(key)) continue
      pageCount = Math.max(pageCount, (result as { pageCount?: number })?.pageCount ?? 1)
    }

    const pagination = pageCount > 1 ? { page: 1, pageCount, basePath: path } : undefined
    const finished = finishPage(html, path, source, pagination)
    await writePage(path, finished)
    recordSitemap(path, source)

    // SEO lint — warnings, like the link validator, never failures.
    for (const issue of auditPageHtml(finished)) warn(`[mechanica] SEO on ${path}: ${issue}`)
    const title = finished.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    if (title) titlePages.set(title, [...(titlePages.get(title) ?? []), path])

    if (!pagination) continue
    const base = path === '/' ? '' : path
    for (let n = 2; n <= pageCount; n++) {
      const variantPath = `${base}/${n}`
      if (knownPaths.has(variantPath)) {
        throw new Error(
          `[mechanica] Paginated page ${path} needs ${variantPath}, but a real page already ` +
            `exists at that path — rename that page or adjust the pagination.`,
        )
      }
      variants.push({
        ...source,
        path: variantPath,
        page: { ...source.page, pagination: { page: n, pageCount } },
      })
    }
  }

  // Duplicate titles read as duplicate pages to search engines.
  for (const [title, paths] of titlePages) {
    if (paths.length > 1) {
      warn(`[mechanica] SEO: ${paths.length} pages share the title "${title}": ${paths.join(', ')}`)
    }
  }

  // Second pass: the paginated variants — same content, each rendered with its
  // own chunk of the query baked into its state.
  for await (const { html, path } of generateProject({ ...projectOptions, pages: variants })) {
    const source = variants.find((page) => page.path === path)!
    const basePath = path.replace(/\/\d+$/, '') || '/'
    const finished = finishPage(html, path, source, { ...source.page!.pagination!, basePath })
    await writePage(path, finished)
    recordSitemap(path, source, source.page!.pagination!.page)
  }

  await copyUploads(join(cwd, '.mech/assets'), join(exportDir, MEDIA_DIR), referenced, warn)

  // Static-host 404 convention: a `/404` page also lands at export/404.html.
  if (written.includes('/404')) {
    await copyFile(join(exportDir, '404/index.html'), join(exportDir, '404.html'))
  }

  if (siteUrl) {
    await writeFile(join(exportDir, 'sitemap.xml'), buildSitemap(siteUrl, sitemapEntries))
    // A default robots.txt pointing at the sitemap — the site's own (from
    // `public/robots.txt`, copied above) always wins.
    const robotsPath = join(exportDir, 'robots.txt')
    const hasOwnRobots = await access(robotsPath).then(
      () => true,
      () => false,
    )
    if (!hasOwnRobots) await writeFile(robotsPath, buildRobotsTxt(siteUrl))
  }

  return written
}

/** Copy referenced uploads into the export; warn about missing + orphaned files. */
async function copyUploads(
  assetsDir: string,
  outDir: string,
  referenced: Set<string>,
  warn: (message: string) => void,
): Promise<void> {
  for (const relative of referenced) {
    const target = join(outDir, relative)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(assetsDir, relative), target).catch(() => {
      warn(`[mechanica] Missing upload: ${relative} is referenced by a page but not in .mech/assets`)
    })
  }

  // Orphans: uploads no page references. Report only — deleting is the user's
  // call. Cropped derivatives are a regenerable cache, not source files, so a
  // stale one (from an earlier crop) isn't worth a warning.
  const existing = (await readdir(assetsDir, { recursive: true }).catch(() => [])) as string[]
  const orphans = existing
    .map((entry) => entry.replace(/\\/g, '/'))
    .filter((entry) => /\.\w+$/.test(entry) && !referenced.has(entry) && !isDerivedAsset(entry))
  if (orphans.length) {
    warn(
      `[mechanica] ${orphans.length} unused upload(s) in .mech/assets (not exported): ${orphans.join(', ')}`,
    )
  }
}

/** Build the project, then statically render every page into `export/`. */
export async function runExport(options: ExportOptions = {}): Promise<void> {
  await runBuild()
  registerFieldSchemas()

  const cwd = process.cwd()
  const ssr = (await import(pathToFileURL(join(cwd, 'dist/ssr.js')).href)) as SsrBundle
  const written = await exportProject(cwd, ssr, options)

  for (const path of written) console.info('Generated', path)
  console.info(`Exported ${written.length} page(s) → export/`)
}
