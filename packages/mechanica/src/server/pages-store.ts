import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, parse, relative, resolve } from 'node:path'
import {
  diffTranslation,
  migrateContent,
  passDefaultValue,
  walkTree,
  type Block,
  type ContentBlock,
  type LocalesConfig,
  type VirtualPage,
} from 'mechanica-shared'
import { parsePage, serializePage, type PageDoc, type RichTextCodec } from 'mechanica-shared/page-format'
import { applyImageManifest, harvestImageMeta, readImageManifest, updateImageManifest } from './assets-store'
import { writeFileAtomic, markMutated } from './fs-utils'

/** Shape of a page file under `<mech>/pages` (the parsed `.page.md` document). */
export type PageFile = PageDoc

/** File extension for page documents under `<mech>/pages`. */
const EXT = '.page.md'

/**
 * A page filename's `@locale` variant suffix. A translation of `about.page.md`
 * for locale `ru` is stored as `about@ru.page.md` (and `blog/index@ru.page.md`
 * for a folder index). The `@` can't appear in a page slug, so the split is
 * unambiguous. Matched against a filename *stem* (no extension).
 */
const VARIANT_RE = /^(.*)@([A-Za-z][A-Za-z0-9_-]*)$/

/** Apply a locale variant suffix to a page *file* path (undefined = the base file). */
function localizeFile(file: string, locale?: string): string {
  if (!locale) return file
  return file.slice(0, -EXT.length) + `@${locale}` + EXT
}

/**
 * Every translation file of a logical page — `[{ locale, file }]` for each
 * `<stem>@<locale>.page.md` sibling of the base file. Empty when the page has
 * no translations (or its folder doesn't exist yet).
 */
export function variantFilesOf(mechDir: string, urlPath: string): { locale: string; file: string }[] {
  const baseFile = getPagePath(mechDir, urlPath)
  const dir = dirname(baseFile)
  const stem = basename(baseFile).slice(0, -EXT.length) // 'about' | 'index'
  if (!fs.existsSync(dir)) return []
  const out: { locale: string; file: string }[] = []
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(EXT)) continue
    const middle = entry.slice(0, -EXT.length) // 'about@ru'
    const variant = middle.match(VARIANT_RE)
    if (variant && variant[1] === stem) out.push({ locale: variant[2]!, file: join(dir, entry) })
  }
  return out
}

/**
 * The locales a logical page is available in — the default (its base file, when
 * present) plus every translation whose code the config knows, in config order.
 */
export function translationsOf(mechDir: string, urlPath: string, config: LocalesConfig): string[] {
  const present = new Set<string>()
  if (pageVersion(mechDir, urlPath) != null) present.add(config.default)
  for (const { locale } of variantFilesOf(mechDir, urlPath)) {
    if (config.all.includes(locale)) present.add(locale)
  }
  return config.all.filter((code) => present.has(code))
}

// What the stores know about the code behind a `.mech` directory, keyed by
// that directory — one process may serve many sites, and one site's block
// schemas must never shape another's pages. `configureSite` (site.ts) fills it
// from a site manifest.
interface SiteContext {
  /** Converts richText fields between Markdown (disk) and vuewrite `Block[]` (state). */
  codec?: RichTextCodec
  /** Block metadata: schema migrations on read, defaults, image-field lookup. */
  blocks?: Map<string, Block>
}
const sites = new Map<string, SiteContext>()
const siteOf = (mechDir: string): SiteContext => {
  const key = resolve(mechDir)
  let site = sites.get(key)
  if (!site) sites.set(key, (site = {}))
  return site
}

/** Configure the codec used to (de)serialize a site's rich-text fields. */
export function setPageCodec(mechDir: string, codec: RichTextCodec | undefined): void {
  siteOf(mechDir).codec = codec
}

const codecOptions = (mechDir: string) => {
  const codec = siteOf(mechDir).codec
  return codec ? { richText: codec } : undefined
}

/** Configure the block metadata a site's pages are read and written with. */
export function setPageBlocks(mechDir: string, blocks: Block[] | undefined): void {
  siteOf(mechDir).blocks = blocks ? new Map(blocks.map((block) => [block.id, block])) : undefined
}

/**
 * Fill schema defaults into placed block data, in place — the same pass
 * `generatePage` runs at export, so a hand-authored `.page.md` that omits a
 * defaulted prop renders identically in dev and in the exported site.
 * A no-op until {@link setPageBlocks} has run.
 */
export function fillContentDefaults(mechDir: string, content: ContentBlock[]): void {
  const blocksMeta = siteOf(mechDir).blocks
  if (!blocksMeta) return
  walkTree(content, (block) => {
    const meta = blocksMeta.get(block.blockId)
    if (meta?.props) block.data = passDefaultValue(block.data ?? {}, meta.props)
  })
}

/**
 * Inject cached image metadata (`.mech/images.json`: LQIP previews and
 * intrinsic dimensions) into the content's image field values — the inverse
 * of the harvesting {@link savePage} does, so page files stay blob-free while
 * runtime state is complete. A no-op until {@link setPageBlocks} has run.
 */
export function fillImageMeta(mechDir: string, content: ContentBlock[]): void {
  const blocksMeta = siteOf(mechDir).blocks
  if (!blocksMeta) return
  applyImageManifest(content, blocksMeta, readImageManifest(mechDir))
}

/** A page entry as returned by {@link listPages}. */
export interface PageListItem {
  path: string
  name: string
  folderPath: string | null
  order: number
  orderAfter: string | null
  /** A work-in-progress page — hidden from queries and the static export. */
  draft: boolean
  /**
   * The page's explicit layout (base file's `layout:` frontmatter). Absent for
   * pages on the default layout — so its presence alone marks the exceptions.
   */
  layout?: string
  /**
   * The locales this logical page is available in (multi-language sites only) —
   * the default plus every translation present, in config order. Absent when
   * i18n is off. Translation files never get their own list row.
   */
  locales?: string[]
  /**
   * True for a programmatically generated page ({@link VirtualPage} from the
   * plugin's `generatePages`): it has no file, so the editor lists it read-only
   * (no rename / duplicate / delete / translate).
   */
  generated?: boolean
  [key: string]: unknown
}

/** Thrown by {@link createPage} when the target page already exists. */
export class PageExistsError extends Error {
  constructor(public readonly path: string) {
    super(`Page already exists: ${path}`)
    this.name = 'PageExistsError'
  }
}

const emptyPage = (): PageFile => ({ content: [], data: {} })

const readFile = (mechDir: string, file: string): PageFile =>
  parsePage(fs.readFileSync(file, 'utf-8'), codecOptions(mechDir))

const writeFile = (mechDir: string, file: string, page: PageFile): void => {
  writeFileAtomic(file, serializePage(page, codecOptions(mechDir)))
}

/**
 * Resolve a URL path to its page file under `<mechDir>/pages`. A `locale`
 * (a non-default locale code) targets the `@<locale>` translation file;
 * undefined targets the base (default-locale) file.
 */
export function getPagePath(mechDir: string, urlPath: string, locale?: string): string {
  const pagesDir = join(mechDir, 'pages')
  const normalized = urlPath.trim().replace(/\/+$/, '').replace(/^\/+/, '')
  const asDirectory = fs.statSync(join(pagesDir, normalized), { throwIfNoEntry: false })?.isDirectory()
  const relativePath = asDirectory ? join(normalized, `index${EXT}`) : `${normalized}${EXT}`
  return localizeFile(join(pagesDir, relativePath), locale)
}

/** Read a page file (a locale's translation, or the base), returning empty when missing. */
export function readPage(mechDir: string, urlPath: string, locale?: string): PageFile {
  const file = getPagePath(mechDir, urlPath, locale)
  if (!fs.existsSync(file)) return emptyPage()
  const page = readFile(mechDir, file)
  // Upgrade data written with an older block schema; the change persists with
  // the page's next save (this read does not write).
  const blocksMeta = siteOf(mechDir).blocks
  if (blocksMeta && page.content) migrateContent(page.content, blocksMeta)
  return page
}

/**
 * A page's current on-disk version — a hash of its file content, `null` when
 * the file does not exist. The editor sends the version it loaded back with
 * each save so the dev server can reject saves over external edits. Per-locale:
 * a translation's version is that variant file's hash.
 */
export function pageVersion(mechDir: string, urlPath: string, locale?: string): string | null {
  const file = getPagePath(mechDir, urlPath, locale)
  if (!fs.existsSync(file)) return null
  return createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 16)
}

/**
 * The inverse of {@link getPagePath}: the *logical* URL path a page file is
 * served at (a translation maps to the same logical path as its base), or
 * `null` when the file is not a page document under `<mechDir>/pages`.
 */
export function pageUrlOf(mechDir: string, file: string): string | null {
  const rel = relative(join(mechDir, 'pages'), file).replace(/\\/g, '/')
  if (rel.startsWith('..') || !rel.endsWith(EXT)) return null
  let path = rel.slice(0, -EXT.length)
  // Drop a translation's `@<locale>` suffix so it resolves to its logical page.
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash + 1)
  const stem = slash === -1 ? path : path.slice(slash + 1)
  const variant = stem.match(VARIANT_RE)
  path = dir + (variant ? variant[1]! : stem)
  if (path === 'index') path = ''
  else if (path.endsWith('/index')) path = path.slice(0, -'/index'.length)
  return '/' + path
}

/** Create a new page, throwing {@link PageExistsError} if it already exists. */
export function createPage(
  mechDir: string,
  input: { path: string; name: string; folderId?: string },
): PageFile {
  const folderPrefix = typeof input.folderId === 'string' ? `/${input.folderId}` : ''
  const file = getPagePath(mechDir, folderPrefix + input.path.trim())
  if (fs.existsSync(file)) throw new PageExistsError(input.path)

  const page: PageFile = { content: [], data: {}, name: input.name, path: input.path }
  writeFile(mechDir, file, page)

  return { ...page, path: folderPrefix + input.path.trim() }
}

/** Copy a page (and all its translations) to a new path, throwing if the target exists. */
export function duplicatePage(
  mechDir: string,
  sourcePath: string,
  input: { path: string; name: string; folderId?: string },
): PageFile {
  const source = readPage(mechDir, sourcePath)
  const folderPrefix = typeof input.folderId === 'string' ? `/${input.folderId}` : ''
  const targetPath = folderPrefix + input.path.trim()
  const file = getPagePath(mechDir, targetPath)
  if (fs.existsSync(file)) throw new PageExistsError(input.path)

  const page: PageFile = {
    content: source.content ?? [],
    data: source.data ?? {},
    meta: source.meta,
    ...(source.layout ? { layout: source.layout } : {}),
    name: input.name,
    path: input.path,
    // A copy of a draft starts as a draft too; publish it when it's ready.
    ...(source.draft ? { draft: true } : {}),
  }
  writeFile(mechDir, file, page)

  // A duplicate is the same logical page in every locale — copy the translations too.
  for (const { locale, file: variantFile } of variantFilesOf(mechDir, sourcePath)) {
    const variant = readFile(mechDir, variantFile)
    writeFile(mechDir, getPagePath(mechDir, targetPath, locale), {
      content: variant.content ?? [],
      data: variant.data ?? {},
      meta: variant.meta,
      name: input.name,
      path: input.path,
      ...(variant.draft ? { draft: true } : {}),
    })
  }

  return { ...page, path: targetPath }
}

/**
 * Delete a page and all its translations; also removes a now-empty folder
 * directory. Returns whether anything existed.
 */
export function deletePage(mechDir: string, urlPath: string): boolean {
  const file = getPagePath(mechDir, urlPath)
  const variants = variantFilesOf(mechDir, urlPath)
  const existed = fs.existsSync(file)
  if (!existed && variants.length === 0) return false

  for (const { file: variantFile } of variants) {
    fs.rmSync(variantFile)
    markMutated(variantFile)
  }
  if (existed) {
    fs.rmSync(file)
    markMutated(file)
  }

  const dir = dirname(file)
  const pagesDir = join(mechDir, 'pages')
  if (dir !== pagesDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmSync(dir, { recursive: true })
  }
  return true
}

/**
 * Create a translation of a page. The file starts empty — every field inherits
 * the default-locale page until it's actually translated. Reads (buildPageState,
 * export) overlay the base under the translation, so an empty file renders
 * identical to the default-locale page (the editor flags it as untranslated).
 */
export function createTranslation(mechDir: string, urlPath: string, locale: string): PageFile {
  const target = getPagePath(mechDir, urlPath, locale)
  if (fs.existsSync(target)) throw new PageExistsError(urlPath)
  const source = readPage(mechDir, urlPath)
  const page: PageFile = {
    content: [],
    data: {},
    name: source.name,
    path: source.path,
    ...(source.draft ? { draft: true } : {}),
  }
  writeFile(mechDir, target, page)
  return page
}

/** Delete a single translation of a page. Returns whether it existed. */
export function deleteTranslation(mechDir: string, urlPath: string, locale: string): boolean {
  const target = getPagePath(mechDir, urlPath, locale)
  if (!fs.existsSync(target)) return false
  fs.rmSync(target)
  markMutated(target)
  return true
}

/**
 * Move a page to a new URL path, preserving its content/data. Throws
 * {@link PageExistsError} if a different page already lives at the target.
 * Cleans up a now-empty source folder. Returns the page's new URL path.
 */
export function movePage(mechDir: string, fromPath: string, toPath: string): { path: string } {
  const file = getPagePath(mechDir, fromPath)
  if (!fs.existsSync(file)) throw new Error(`Page not found: ${fromPath}`)

  const cleaned = '/' + toPath.trim().replace(/^\/+|\/+$/g, '')
  const target = getPagePath(mechDir, cleaned)
  if (target !== file && fs.existsSync(target)) throw new PageExistsError(cleaned)

  // The translations move with the base — same logical page, new path.
  const variants = variantFilesOf(mechDir, fromPath)

  const page = readFile(mechDir, file)
  page.path = cleaned
  writeFile(mechDir, target, page)
  for (const { locale, file: variantFile } of variants) {
    const variant = readFile(mechDir, variantFile)
    variant.path = cleaned
    writeFile(mechDir, getPagePath(mechDir, cleaned, locale), variant)
  }

  if (target !== file) {
    fs.rmSync(file)
    markMutated(file)
    for (const { file: variantFile } of variants) {
      fs.rmSync(variantFile)
      markMutated(variantFile)
    }
    const dir = dirname(file)
    const pagesDir = join(mechDir, 'pages')
    if (dir !== pagesDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmSync(dir, { recursive: true })
    }
  }
  return { path: cleaned }
}

/**
 * Merge content/data into a page and persist it. A `locale` (a non-default
 * code) writes to that translation's variant file — creating it if this is the
 * page's first edit in that locale. Returns the new on-disk version.
 */
export function savePage(
  mechDir: string,
  urlPath: string,
  patch: { content?: unknown[]; data?: Record<string, unknown>; layout?: string | null },
  locale?: string,
): string | null {
  const file = getPagePath(mechDir, urlPath, locale)
  const page = fs.existsSync(file) ? readFile(mechDir, file) : emptyPage()
  if (patch.content !== undefined) page.content = patch.content as ContentBlock[]
  if (patch.data !== undefined) page.data = patch.data
  // The layout is base-owned (translations inherit it): only the default-locale
  // save applies it. `null`/'' clears the key (back to the default layout);
  // undefined leaves the file untouched.
  if (patch.layout !== undefined && !locale) {
    if (patch.layout) page.layout = patch.layout
    else delete page.layout
  }
  // Derived image metadata (LQIP previews) moves to `.mech/images.json` on the
  // way to disk — `.page.md` stays free of base64 blobs, and the state builder
  // injects the entries back (fillImageMeta). This is also how client-side
  // captured previews reach the manifest when `sharp` isn't installed.
  const blocksMeta = siteOf(mechDir).blocks
  if (blocksMeta && page.content) {
    updateImageManifest(mechDir, harvestImageMeta(page.content, blocksMeta))
  }
  // A translation stores only what differs from the default-locale page — shared
  // fields (images, links, layout) inherit at read time. Diff against a base
  // normalized the same way (defaults + image meta filled, then LQIP stripped)
  // so equal values compare equal and collapse away.
  if (locale && pageVersion(mechDir, urlPath) != null) {
    const base = readPage(mechDir, urlPath)
    if (blocksMeta && base.content) {
      fillContentDefaults(mechDir, base.content)
      fillImageMeta(mechDir, base.content)
      harvestImageMeta(base.content, blocksMeta)
    }
    const sparse = diffTranslation(
      { content: base.content ?? [], data: base.data ?? {} },
      { content: (page.content as ContentBlock[]) ?? [], data: page.data ?? {} },
    )
    page.content = sparse.content
    page.data = sparse.data
  }
  writeFile(mechDir, file, page)
  return pageVersion(mechDir, urlPath, locale)
}

/**
 * Update a page's display name (its label in the editor's page list) across the
 * base file and every translation, so the label stays consistent per locale.
 * Per-page <head> metadata (title, description, …) is not stored here — it lives
 * in a page-scoped `defineData` entry templated into the HTML.
 */
export function renamePage(mechDir: string, urlPath: string, name: string): void {
  const file = getPagePath(mechDir, urlPath)
  const files = [file, ...variantFilesOf(mechDir, urlPath).map((v) => v.file)]
  let wrote = false
  for (const target of files) {
    if (!fs.existsSync(target)) continue
    const page = readFile(mechDir, target)
    page.name = name
    writeFile(mechDir, target, page)
    wrote = true
  }
  // Preserve the historical behavior of materializing a missing base page.
  if (!wrote) writeFile(mechDir, file, { ...emptyPage(), name })
}

/**
 * Mark a page as draft (work-in-progress) or published. Drafts stay editable in
 * dev but drop out of queries and the static export. A no-op on a missing page.
 */
export function setPageDraft(mechDir: string, urlPath: string, draft: boolean, locale?: string): void {
  const file = getPagePath(mechDir, urlPath, locale)
  if (!fs.existsSync(file)) return
  const page = readFile(mechDir, file)
  if (draft) page.draft = true
  else delete page.draft
  writeFile(mechDir, file, page)
}

/** List folders (top-level directories) under `<mechDir>/pages`. */
export function listFolders(mechDir: string): { id: string; path: string; name: string }[] {
  const pagesDir = join(mechDir, 'pages')
  if (!fs.existsSync(pagesDir)) return []
  return fs
    .readdirSync(pagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, path: `/${entry.name}`, name: entry.name }))
}

/**
 * List all logical pages, sorted, optionally embedding selected data entries.
 * Translation files (`<stem>@<locale>.page.md`) never become their own row —
 * with a `locales` config each base page instead reports which locales it has
 * a translation for (via `locales`).
 */
export function listPages(
  mechDir: string,
  options: { data?: { id: string }[]; locales?: LocalesConfig; locale?: string; generated?: VirtualPage[] } = {},
): PageListItem[] {
  const pagesDir = join(mechDir, 'pages')
  if (!fs.existsSync(pagesDir)) return []
  const config = options.locales ?? null

  // First pass: collect translation locales per logical path so a base row can
  // report its coverage without re-reading the variant files.
  const variantLocales = new Map<string, Set<string>>()
  const bases: { relative: string; dir: string; base: string; path: string }[] = []
  for (const relative of fs.readdirSync(pagesDir, { recursive: true }) as string[]) {
    if (!relative.endsWith(EXT)) continue
    const parsed = parse(relative)
    const dir = parsed.dir.replace(/\\/g, '/')
    const stem = parsed.base.slice(0, -EXT.length)
    const variant = stem.match(VARIANT_RE)
    const base = variant ? variant[1]! : stem
    const path = `/${dir}/${base === 'index' ? '' : base}`.replace('//', '/').replace(/\/$/, '') || '/'
    if (variant) {
      if (!variantLocales.has(path)) variantLocales.set(path, new Set())
      variantLocales.get(path)!.add(variant[2]!)
      continue
    }
    bases.push({ relative, dir, base, path })
  }

  const items: PageListItem[] = []
  for (const entry of bases) {
    const page = readFile(mechDir, join(pagesDir, entry.relative))
    // Locale-scoped listing (a translated page's query): read the translation
    // for data/name/draft, and drop pages that aren't translated to it — the
    // listing must never link to a page that won't exist at `/<locale>/…`.
    let source = page
    if (options.locale) {
      const variantFile = getPagePath(mechDir, entry.path, options.locale)
      if (!fs.existsSync(variantFile)) continue
      source = readFile(mechDir, variantFile)
    }
    const embedded: Record<string, unknown> = {}
    for (const dataEntry of options.data ?? []) embedded[dataEntry.id] = source.data?.[dataEntry.id] ?? {}

    const item: PageListItem = {
      path: entry.path,
      name: source.name ?? entry.base,
      folderPath: entry.dir === '' ? null : entry.dir,
      // Ordering is structural (same across locales) — always from the base file.
      order: page.order ?? 0,
      orderAfter: page.orderAfter ?? null,
      draft: source.draft === true,
      // The layout is base-owned, like ordering.
      ...(page.layout ? { layout: page.layout } : {}),
      ...embedded,
    }
    if (config) {
      const present = variantLocales.get(entry.path) ?? new Set<string>()
      item.locales = config.all.filter((code) => code === config.default || present.has(code))
    }
    items.push(item)
  }

  // Programmatically generated pages (plugin `generatePages`) join the listing —
  // one read-only row per logical path — so they show in the editor's page
  // browser, resolve in `usePages()` queries, and pass `mechanica shot`'s
  // page-exists check, just like file pages.
  if (options.generated?.length) items.push(...generatedPageItems(options.generated, options, config))

  return items.sort(comparePages)
}

/** File-less pages → list rows: one per logical path, with a `locales` union. */
function generatedPageItems(
  generated: VirtualPage[],
  options: { data?: { id: string }[]; locale?: string },
  config: LocalesConfig | null,
): PageListItem[] {
  const groups = new Map<string, VirtualPage[]>()
  for (const vp of generated) {
    const arr = groups.get(vp.path)
    if (arr) arr.push(vp)
    else groups.set(vp.path, [vp])
  }

  const items: PageListItem[] = []
  for (const [path, vps] of groups) {
    const locales = config ? (vps.map((v) => v.locale).filter(Boolean) as string[]) : []
    // Locale-scoped listing (a translated query): skip a page absent in it.
    if (options.locale && !locales.includes(options.locale)) continue
    const source =
      (options.locale ? vps.find((v) => v.locale === options.locale) : undefined) ??
      (config ? vps.find((v) => v.locale === config.default) : undefined) ??
      vps[0]!
    const embedded: Record<string, unknown> = {}
    for (const dataEntry of options.data ?? []) embedded[dataEntry.id] = source.data?.[dataEntry.id] ?? {}

    const dir = path.slice(1).split('/').slice(0, -1).join('/')
    const item: PageListItem = {
      path,
      name: (typeof source.meta?.title === 'string' ? source.meta.title : undefined) ?? path.split('/').pop() ?? path,
      folderPath: dir === '' ? null : dir,
      order: 0,
      orderAfter: null,
      draft: false,
      generated: true,
      ...embedded,
    }
    if (config) item.locales = config.all.filter((code) => locales.includes(code))
    items.push(item)
  }
  return items
}

/** Ordering: by folder, then explicit `orderAfter`, then `order`, then path. */
function comparePages(a: PageListItem, b: PageListItem): number {
  if (a.folderPath === b.folderPath) {
    if (a.orderAfter === b.path) return 1
    if (b.orderAfter === a.path) return -1
    if (a.order === b.order) {
      return (a.orderAfter ?? a.path).localeCompare(b.orderAfter ?? b.path)
    }
    return a.order - b.order
  }
  if (!a.folderPath) return -1
  if (!b.folderPath) return 1
  return a.folderPath.localeCompare(b.folderPath)
}
