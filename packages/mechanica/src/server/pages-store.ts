import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
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
import { applyImageManifest, contentImageNames, harvestImageMeta, type ImageManifest } from './assets-store'
import { contentFilesOf, type ContentFiles, type Mech } from './content-files'

/** Shape of a page file under `<mech>/pages` (the parsed `.page.md` document). */
export type PageFile = PageDoc

/** File extension for page documents under `<mech>/pages`. */
const EXT = '.page.md'
/** The directory of page documents, relative to the `.mech` root. */
const PAGES = 'pages'

const dirOf = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf('/')))
const baseOf = (file: string) => file.slice(file.lastIndexOf('/') + 1)

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
 * `<stem>@<locale>.page.md` sibling of the base file (`file` is relative to the
 * `.mech` root). Empty when the page has no translations.
 */
export function variantFilesOf(mech: Mech, urlPath: string): { locale: string; file: string }[] {
  const files = contentFilesOf(mech)
  const baseFile = pageFile(files, urlPath)
  const dir = dirOf(baseFile)
  const stem = baseOf(baseFile).slice(0, -EXT.length) // 'about' | 'index'
  const out: { locale: string; file: string }[] = []
  for (const file of files.list(dir)) {
    if (dirOf(file) !== dir || !file.endsWith(EXT)) continue
    const middle = baseOf(file).slice(0, -EXT.length) // 'about@ru'
    const variant = middle.match(VARIANT_RE)
    if (variant && variant[1] === stem) out.push({ locale: variant[2]!, file })
  }
  return out
}

/**
 * The locales a logical page is available in — the default (its base file, when
 * present) plus every translation whose code the config knows, in config order.
 */
export function translationsOf(mech: Mech, urlPath: string, config: LocalesConfig): string[] {
  const present = new Set<string>()
  if (pageVersion(mech, urlPath) != null) present.add(config.default)
  for (const { locale } of variantFilesOf(mech, urlPath)) {
    if (config.all.includes(locale)) present.add(locale)
  }
  return config.all.filter((code) => present.has(code))
}

// What the stores know about the code behind a site's content, hanging off its
// files — one process may serve many sites, and one site's block schemas must
// never shape another's pages. `configureSite` (site.ts) fills it from a site
// manifest.
interface SiteContext {
  /** Converts richText fields between Markdown (disk) and vuewrite `Block[]` (state). */
  codec?: RichTextCodec
  /** Block metadata: schema migrations on read, defaults, image-field lookup. */
  blocks?: Map<string, Block>
}
const sites = new WeakMap<ContentFiles, SiteContext>()
const siteOf = (mech: Mech): SiteContext => {
  const key = contentFilesOf(mech)
  let site = sites.get(key)
  if (!site) sites.set(key, (site = {}))
  return site
}

/** Configure the codec used to (de)serialize a site's rich-text fields. */
export function setPageCodec(mech: Mech, codec: RichTextCodec | undefined): void {
  siteOf(mech).codec = codec
}

const codecOptions = (mech: Mech) => {
  const codec = siteOf(mech).codec
  return codec ? { richText: codec } : undefined
}

/** Configure the block metadata a site's pages are read and written with. */
export function setPageBlocks(mech: Mech, blocks: Block[] | undefined): void {
  siteOf(mech).blocks = blocks ? new Map(blocks.map((block) => [block.id, block])) : undefined
}

/**
 * Fill schema defaults into placed block data, in place — the same pass
 * `generatePage` runs at export, so a hand-authored `.page.md` that omits a
 * defaulted prop renders identically in dev and in the exported site.
 * A no-op until {@link setPageBlocks} has run.
 */
export function fillContentDefaults(mech: Mech, content: ContentBlock[]): void {
  const blocksMeta = siteOf(mech).blocks
  if (!blocksMeta) return
  walkTree(content, (block) => {
    const meta = blocksMeta.get(block.blockId)
    if (meta?.props) block.data = passDefaultValue(block.data ?? {}, meta.props)
  })
}

/**
 * Inject image info (LQIP previews and intrinsic dimensions, kept by the asset
 * store) into the content's image field values — the inverse of the harvesting
 * a save does, so page files stay blob-free while runtime state is complete.
 * A no-op until {@link setPageBlocks} has run.
 */
export function fillImageMeta(mech: Mech, content: ContentBlock[], images: ImageManifest): void {
  const blocksMeta = siteOf(mech).blocks
  if (!blocksMeta) return
  applyImageManifest(content, blocksMeta, images)
}

/** The uploaded images a content tree refers to — whose info {@link fillImageMeta} wants. */
export function imageNamesOf(mech: Mech, content: ContentBlock[]): string[] {
  const blocksMeta = siteOf(mech).blocks
  return blocksMeta ? contentImageNames(content, blocksMeta) : []
}

/**
 * Take the image info out of content that is about to be saved: the preview
 * blobs are removed from the values (see `harvestImageMeta`) and returned, with
 * any dimensions, for the asset store to keep. Empty until {@link setPageBlocks}
 * has run.
 */
export function harvestPageImages(mech: Mech, content: ContentBlock[]): ImageManifest {
  const blocksMeta = siteOf(mech).blocks
  return blocksMeta ? harvestImageMeta(content, blocksMeta) : {}
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

const fileOf = (mech: Mech, urlPath: string, locale?: string) => pageFile(contentFilesOf(mech), urlPath, locale)
const has = (mech: Mech, file: string) => contentFilesOf(mech).has(file)
const remove = (mech: Mech, file: string) => contentFilesOf(mech).remove(file)

const readFile = (mech: Mech, file: string): PageFile =>
  parsePage(contentFilesOf(mech).read(file) ?? '', codecOptions(mech))

const writeFile = (mech: Mech, file: string, page: PageFile): void => {
  contentFilesOf(mech).write(file, serializePage(page, codecOptions(mech)))
}

/**
 * The page file a URL path resolves to, relative to the `.mech` root. A
 * `locale` (a non-default locale code) targets the `@<locale>` translation
 * file; undefined targets the base (default-locale) file.
 */
function pageFile(files: ContentFiles, urlPath: string, locale?: string): string {
  const normalized = urlPath.trim().replace(/\/+$/, '').replace(/^\/+/, '')
  const asDirectory = normalized === '' || files.isDir(`${PAGES}/${normalized}`)
  const relativePath = asDirectory ? `${normalized}/index${EXT}`.replace(/^\//, '') : `${normalized}${EXT}`
  return localizeFile(`${PAGES}/${relativePath}`, locale)
}

/** Resolve a URL path to its page file on disk under `<mechDir>/pages` (see {@link pageFile}). */
export function getPagePath(mechDir: string, urlPath: string, locale?: string): string {
  return join(mechDir, pageFile(contentFilesOf(mechDir), urlPath, locale))
}

/**
 * The folder a page belongs to — the directory holding its page file, relative
 * to `pages/`. Root-level pages return `null` (they have no folder).
 */
export function pageFolderOf(mech: Mech, urlPath: string): string | null {
  const dir = dirOf(fileOf(mech, urlPath)).slice(PAGES.length + 1)
  return dir === '' ? null : dir
}

/** Read a page file (a locale's translation, or the base), returning empty when missing. */
export function readPage(mech: Mech, urlPath: string, locale?: string): PageFile {
  const file = fileOf(mech, urlPath, locale)
  if (!has(mech, file)) return emptyPage()
  const page = readFile(mech, file)
  // Upgrade data written with an older block schema; the change persists with
  // the page's next save (this read does not write).
  const blocksMeta = siteOf(mech).blocks
  if (blocksMeta && page.content) migrateContent(page.content, blocksMeta)
  return page
}

/**
 * A page's current on-disk version — a hash of its file content, `null` when
 * the file does not exist. The editor sends the version it loaded back with
 * each save so the dev server can reject saves over external edits. Per-locale:
 * a translation's version is that variant file's hash.
 */
export function pageVersion(mech: Mech, urlPath: string, locale?: string): string | null {
  const file = fileOf(mech, urlPath, locale)
  const text = contentFilesOf(mech).read(file)
  if (text == null) return null
  return createHash('sha1').update(text).digest('hex').slice(0, 16)
}

/**
 * What a content file is as a page: the *logical* URL path it is served at and,
 * for a translation, its locale. `file` is relative to the `.mech` root
 * (`pages/blog/index@ru.page.md` → `{ path: '/blog', locale: 'ru' }`); null
 * when it is not a page document.
 */
export function pageOfFile(file: string): { path: string; locale?: string } | null {
  if (!file.startsWith(`${PAGES}/`) || !file.endsWith(EXT)) return null
  let path = file.slice(PAGES.length + 1, -EXT.length)
  // Drop a translation's `@<locale>` suffix so it resolves to its logical page.
  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash + 1)
  const stem = slash === -1 ? path : path.slice(slash + 1)
  const variant = stem.match(VARIANT_RE)
  path = dir + (variant ? variant[1]! : stem)
  if (path === 'index') path = ''
  else if (path.endsWith('/index')) path = path.slice(0, -'/index'.length)
  return { path: '/' + path, ...(variant ? { locale: variant[2]! } : {}) }
}

/**
 * The inverse of {@link getPagePath}: the *logical* URL path a page file on
 * disk is served at (a translation maps to the same logical path as its base),
 * or `null` when the file is not a page document under `<mechDir>/pages`.
 */
export function pageUrlOf(mechDir: string, file: string): string | null {
  const rel = relative(mechDir, file).replace(/\\/g, '/')
  return pageOfFile(rel)?.path ?? null
}

/** Create a new page, throwing {@link PageExistsError} if it already exists. */
export function createPage(
  mech: Mech,
  input: { path: string; name: string; folderId?: string },
): PageFile {
  const folderPrefix = typeof input.folderId === 'string' ? `/${input.folderId}` : ''
  const file = fileOf(mech, folderPrefix + input.path.trim())
  if (has(mech, file)) throw new PageExistsError(input.path)

  const page: PageFile = { content: [], data: {}, name: input.name, path: input.path }
  writeFile(mech, file, page)

  return { ...page, path: folderPrefix + input.path.trim() }
}

/** Copy a page (and all its translations) to a new path, throwing if the target exists. */
export function duplicatePage(
  mech: Mech,
  sourcePath: string,
  input: { path: string; name: string; folderId?: string },
): PageFile {
  const source = readPage(mech, sourcePath)
  const folderPrefix = typeof input.folderId === 'string' ? `/${input.folderId}` : ''
  const targetPath = folderPrefix + input.path.trim()
  const file = fileOf(mech, targetPath)
  if (has(mech, file)) throw new PageExistsError(input.path)

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
  writeFile(mech, file, page)

  // A duplicate is the same logical page in every locale — copy the translations too.
  for (const { locale, file: variantFile } of variantFilesOf(mech, sourcePath)) {
    const variant = readFile(mech, variantFile)
    writeFile(mech, fileOf(mech, targetPath, locale), {
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
 * Delete a page and all its translations. Returns whether anything existed.
 */
export function deletePage(mech: Mech, urlPath: string): boolean {
  const file = fileOf(mech, urlPath)
  const variants = variantFilesOf(mech, urlPath)
  const existed = has(mech, file)
  if (!existed && variants.length === 0) return false

  for (const { file: variantFile } of variants) {
    remove(mech, variantFile)
  }
  if (existed) {
    remove(mech, file)
  }
  return true
}

/**
 * Create a translation of a page. The file starts empty — every field inherits
 * the default-locale page until it's actually translated. Reads (buildPageState,
 * export) overlay the base under the translation, so an empty file renders
 * identical to the default-locale page (the editor flags it as untranslated).
 */
export function createTranslation(mech: Mech, urlPath: string, locale: string): PageFile {
  const target = fileOf(mech, urlPath, locale)
  if (has(mech, target)) throw new PageExistsError(urlPath)
  const source = readPage(mech, urlPath)
  const page: PageFile = {
    content: [],
    data: {},
    name: source.name,
    path: source.path,
    ...(source.draft ? { draft: true } : {}),
  }
  writeFile(mech, target, page)
  return page
}

/** Delete a single translation of a page. Returns whether it existed. */
export function deleteTranslation(mech: Mech, urlPath: string, locale: string): boolean {
  const target = fileOf(mech, urlPath, locale)
  if (!has(mech, target)) return false
  remove(mech, target)
  return true
}

/**
 * Move a page to a new URL path, preserving its content/data. Throws
 * {@link PageExistsError} if a different page already lives at the target.
 * Returns the page's new URL path.
 */
export function movePage(mech: Mech, fromPath: string, toPath: string): { path: string } {
  const file = fileOf(mech, fromPath)
  if (!has(mech, file)) throw new Error(`Page not found: ${fromPath}`)

  const cleaned = '/' + toPath.trim().replace(/^\/+|\/+$/g, '')
  const target = fileOf(mech, cleaned)
  if (target !== file && has(mech, target)) throw new PageExistsError(cleaned)

  // The translations move with the base — same logical page, new path. A file
  // is renamed first and rewritten after, so the store sees a move, not a
  // removal and an unrelated new file.
  const files = contentFilesOf(mech)
  const moves = [
    { from: file, to: target },
    ...variantFilesOf(mech, fromPath).map((variant) => ({ from: variant.file, to: localizeFile(target, variant.locale) })),
  ]
  for (const { from, to } of moves) {
    files.rename(from, to)
    const page = readFile(mech, to)
    page.path = cleaned
    writeFile(mech, to, page)
  }
  return { path: cleaned }
}

/**
 * Merge content/data into a page and persist it. A `locale` (a non-default
 * code) writes to that translation's variant file — creating it if this is the
 * page's first edit in that locale. Returns the new on-disk version.
 *
 * Saving a translation compares it with the default-locale page, which needs
 * that page's image info to compare like with like: pass it as `baseImages`
 * (the info of {@link imageNamesOf} the base content).
 */
export function savePage(
  mech: Mech,
  urlPath: string,
  patch: { content?: unknown[]; data?: Record<string, unknown>; layout?: string | null },
  locale?: string,
  baseImages: ImageManifest = {},
): string | null {
  const file = fileOf(mech, urlPath, locale)
  const page = has(mech, file) ? readFile(mech, file) : emptyPage()
  if (patch.content !== undefined) page.content = patch.content as ContentBlock[]
  if (patch.data !== undefined) page.data = patch.data
  // The layout is base-owned (translations inherit it): only the default-locale
  // save applies it. `null`/'' clears the key (back to the default layout);
  // undefined leaves the file untouched.
  if (patch.layout !== undefined && !locale) {
    if (patch.layout) page.layout = patch.layout
    else delete page.layout
  }
  // Derived image metadata (LQIP previews) never reaches the page file —
  // `.page.md` stays free of base64 blobs. The caller that wants to keep it
  // (the editor service, for the asset store) harvests it before saving; this
  // pass only guarantees the file is clean either way.
  const blocksMeta = siteOf(mech).blocks
  if (blocksMeta && page.content) harvestImageMeta(page.content, blocksMeta)
  // A translation stores only what differs from the default-locale page — shared
  // fields (images, links, layout) inherit at read time. Diff against a base
  // normalized the same way (defaults + image meta filled, then LQIP stripped)
  // so equal values compare equal and collapse away.
  if (locale && pageVersion(mech, urlPath) != null) {
    const base = readPage(mech, urlPath)
    if (blocksMeta && base.content) {
      fillContentDefaults(mech, base.content)
      fillImageMeta(mech, base.content, baseImages)
      harvestImageMeta(base.content, blocksMeta)
    }
    const sparse = diffTranslation(
      { content: base.content ?? [], data: base.data ?? {} },
      { content: (page.content as ContentBlock[]) ?? [], data: page.data ?? {} },
    )
    page.content = sparse.content
    page.data = sparse.data
  }
  writeFile(mech, file, page)
  return pageVersion(mech, urlPath, locale)
}

/**
 * Update a page's display name (its label in the editor's page list) across the
 * base file and every translation, so the label stays consistent per locale.
 * Per-page <head> metadata (title, description, …) is not stored here — it lives
 * in a page-scoped `defineData` entry templated into the HTML.
 */
export function renamePage(mech: Mech, urlPath: string, name: string): void {
  const file = fileOf(mech, urlPath)
  const files = [file, ...variantFilesOf(mech, urlPath).map((v) => v.file)]
  let wrote = false
  for (const target of files) {
    if (!has(mech, target)) continue
    const page = readFile(mech, target)
    page.name = name
    writeFile(mech, target, page)
    wrote = true
  }
  // Preserve the historical behavior of materializing a missing base page.
  if (!wrote) writeFile(mech, file, { ...emptyPage(), name })
}

/**
 * Mark a page as draft (work-in-progress) or published. Drafts stay editable in
 * dev but drop out of queries and the static export. A no-op on a missing page.
 */
export function setPageDraft(mech: Mech, urlPath: string, draft: boolean, locale?: string): void {
  const file = fileOf(mech, urlPath, locale)
  if (!has(mech, file)) return
  const page = readFile(mech, file)
  if (draft) page.draft = true
  else delete page.draft
  writeFile(mech, file, page)
}

/** List folders (top-level directories) under `pages`. */
export function listFolders(mech: Mech): { id: string; path: string; name: string }[] {
  return contentFilesOf(mech)
    .dirs(PAGES)
    .map((name) => ({ id: name, path: `/${name}`, name }))
}

/**
 * List all logical pages, sorted, optionally embedding selected data entries.
 * Translation files (`<stem>@<locale>.page.md`) never become their own row —
 * with a `locales` config each base page instead reports which locales it has
 * a translation for (via `locales`).
 */
export function listPages(
  mech: Mech,
  options: { data?: { id: string }[]; locales?: LocalesConfig; locale?: string; generated?: VirtualPage[] } = {},
): PageListItem[] {
  const config = options.locales ?? null

  // First pass: collect translation locales per logical path so a base row can
  // report its coverage without re-reading the variant files.
  const variantLocales = new Map<string, Set<string>>()
  const bases: { file: string; dir: string; base: string; path: string }[] = []
  for (const file of contentFilesOf(mech).list(PAGES)) {
    const page = pageOfFile(file)
    if (!page) continue
    if (page.locale) {
      if (!variantLocales.has(page.path)) variantLocales.set(page.path, new Set())
      variantLocales.get(page.path)!.add(page.locale)
      continue
    }
    const dir = dirOf(file).slice(PAGES.length + 1)
    bases.push({ file, dir, base: baseOf(file).slice(0, -EXT.length), path: page.path })
  }

  const items: PageListItem[] = []
  for (const entry of bases) {
    const page = readFile(mech, entry.file)
    // Locale-scoped listing (a translated page's query): read the translation
    // for data/name/draft, and drop pages that aren't translated to it — the
    // listing must never link to a page that won't exist at `/<locale>/…`.
    let source = page
    if (options.locale) {
      const variantFile = fileOf(mech, entry.path, options.locale)
      if (!has(mech, variantFile)) continue
      source = readFile(mech, variantFile)
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
