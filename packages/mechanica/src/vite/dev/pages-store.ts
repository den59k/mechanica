import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, parse, relative } from 'node:path'
import {
  migrateContent,
  passDefaultValue,
  walkTree,
  type Block,
  type ContentBlock,
} from 'mechanica-shared'
import { parsePage, serializePage, type PageDoc, type RichTextCodec } from 'mechanica-shared/page-format'
import { applyImageManifest, harvestImageMeta, readImageManifest, updateImageManifest } from './assets-store'
import { writeFileAtomic, markMutated } from './fs-utils'

/** Shape of a page file under `<mech>/pages` (the parsed `.page.md` document). */
export type PageFile = PageDoc

/** File extension for page documents under `<mech>/pages`. */
const EXT = '.page.md'

// The rich-text adapter is process-global: the dev server configures it once
// (from the project's block schemas) so every read/write converts richText
// fields between Markdown (disk) and vuewrite `Block[]` (state) consistently.
let richTextCodec: RichTextCodec | undefined

/** Configure the codec used to (de)serialize rich-text fields. Dev server only. */
export function setPageCodec(codec: RichTextCodec | undefined): void {
  richTextCodec = codec
}

const codecOptions = () => (richTextCodec ? { richText: richTextCodec } : undefined)

// Block metadata (same lifecycle as the codec): lets page reads run schema
// migrations, so the editor and dev render never see stale-shaped block data.
let blocksMeta: Map<string, Block> | undefined

/** Configure block metadata used to migrate page data on read. Dev server only. */
export function setPageBlocks(blocks: Block[] | undefined): void {
  blocksMeta = blocks ? new Map(blocks.map((block) => [block.id, block])) : undefined
}

/**
 * Fill schema defaults into placed block data, in place — the same pass
 * `generatePage` runs at export, so a hand-authored `.page.md` that omits a
 * defaulted prop renders identically in dev and in the exported site.
 * A no-op until {@link setPageBlocks} has run.
 */
export function fillContentDefaults(content: ContentBlock[]): void {
  if (!blocksMeta) return
  walkTree(content, (block) => {
    const meta = blocksMeta!.get(block.blockId)
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

const readFile = (file: string): PageFile => parsePage(fs.readFileSync(file, 'utf-8'), codecOptions())

const writeFile = (file: string, page: PageFile): void => {
  writeFileAtomic(file, serializePage(page, codecOptions()))
}

/** Resolve a URL path to its page file under `<mechDir>/pages`. */
export function getPagePath(mechDir: string, urlPath: string): string {
  const pagesDir = join(mechDir, 'pages')
  const normalized = urlPath.trim().replace(/\/+$/, '').replace(/^\/+/, '')
  const asDirectory = fs.statSync(join(pagesDir, normalized), { throwIfNoEntry: false })?.isDirectory()
  const relative = asDirectory ? join(normalized, `index${EXT}`) : `${normalized}${EXT}`
  return join(pagesDir, relative)
}

/** Read a page file, returning an empty page when it does not exist. */
export function readPage(mechDir: string, urlPath: string): PageFile {
  const file = getPagePath(mechDir, urlPath)
  if (!fs.existsSync(file)) return emptyPage()
  const page = readFile(file)
  // Upgrade data written with an older block schema; the change persists with
  // the page's next save (this read does not write).
  if (blocksMeta && page.content) migrateContent(page.content, blocksMeta)
  return page
}

/**
 * A page's current on-disk version — a hash of its file content, `null` when
 * the file does not exist. The editor sends the version it loaded back with
 * each save so the dev server can reject saves over external edits.
 */
export function pageVersion(mechDir: string, urlPath: string): string | null {
  const file = getPagePath(mechDir, urlPath)
  if (!fs.existsSync(file)) return null
  return createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 16)
}

/**
 * The inverse of {@link getPagePath}: the URL path a page file is served at,
 * or `null` when the file is not a page document under `<mechDir>/pages`.
 */
export function pageUrlOf(mechDir: string, file: string): string | null {
  const rel = relative(join(mechDir, 'pages'), file).replace(/\\/g, '/')
  if (rel.startsWith('..') || !rel.endsWith(EXT)) return null
  let path = rel.slice(0, -EXT.length)
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
  writeFile(file, page)

  return { ...page, path: folderPrefix + input.path.trim() }
}

/** Copy a page's content/data to a new path, throwing if the target exists. */
export function duplicatePage(
  mechDir: string,
  sourcePath: string,
  input: { path: string; name: string; folderId?: string },
): PageFile {
  const source = readPage(mechDir, sourcePath)
  const folderPrefix = typeof input.folderId === 'string' ? `/${input.folderId}` : ''
  const file = getPagePath(mechDir, folderPrefix + input.path.trim())
  if (fs.existsSync(file)) throw new PageExistsError(input.path)

  const page: PageFile = {
    content: source.content ?? [],
    data: source.data ?? {},
    meta: source.meta,
    name: input.name,
    path: input.path,
    // A copy of a draft starts as a draft too; publish it when it's ready.
    ...(source.draft ? { draft: true } : {}),
  }
  writeFile(file, page)

  return { ...page, path: folderPrefix + input.path.trim() }
}

/** Delete a page; also removes a now-empty folder directory. Returns whether it existed. */
export function deletePage(mechDir: string, urlPath: string): boolean {
  const file = getPagePath(mechDir, urlPath)
  if (!fs.existsSync(file)) return false
  fs.rmSync(file)
  markMutated(file)

  const dir = dirname(file)
  const pagesDir = join(mechDir, 'pages')
  if (dir !== pagesDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmSync(dir, { recursive: true })
  }
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

  const page = readFile(file)
  page.path = cleaned
  writeFile(target, page)

  if (target !== file) {
    fs.rmSync(file)
    markMutated(file)
    const dir = dirname(file)
    const pagesDir = join(mechDir, 'pages')
    if (dir !== pagesDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmSync(dir, { recursive: true })
    }
  }
  return { path: cleaned }
}

/** Merge content/data into a page and persist it. Returns the new on-disk version. */
export function savePage(
  mechDir: string,
  urlPath: string,
  patch: { content?: unknown[]; data?: Record<string, unknown> },
): string | null {
  const file = getPagePath(mechDir, urlPath)
  const page = fs.existsSync(file) ? readFile(file) : emptyPage()
  if (patch.content !== undefined) page.content = patch.content as ContentBlock[]
  if (patch.data !== undefined) page.data = patch.data
  // Derived image metadata (LQIP previews) moves to `.mech/images.json` on the
  // way to disk — `.page.md` stays free of base64 blobs, and the state builder
  // injects the entries back (fillImageMeta). This is also how client-side
  // captured previews reach the manifest when `sharp` isn't installed.
  if (blocksMeta && page.content) {
    updateImageManifest(mechDir, harvestImageMeta(page.content, blocksMeta))
  }
  writeFile(file, page)
  return pageVersion(mechDir, urlPath)
}

/**
 * Update a page's display name (its label in the editor's page list). Per-page
 * <head> metadata (title, description, …) is no longer stored here — it lives in
 * a page-scoped `defineData` entry templated into the HTML.
 */
export function renamePage(mechDir: string, urlPath: string, name: string): void {
  const file = getPagePath(mechDir, urlPath)
  const page = fs.existsSync(file) ? readFile(file) : emptyPage()
  page.name = name
  writeFile(file, page)
}

/**
 * Mark a page as draft (work-in-progress) or published. Drafts stay editable in
 * dev but drop out of queries and the static export. A no-op on a missing page.
 */
export function setPageDraft(mechDir: string, urlPath: string, draft: boolean): void {
  const file = getPagePath(mechDir, urlPath)
  if (!fs.existsSync(file)) return
  const page = readFile(file)
  if (draft) page.draft = true
  else delete page.draft
  writeFile(file, page)
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

/** List all pages, sorted, optionally embedding selected data entries. */
export function listPages(
  mechDir: string,
  options: { data?: { id: string }[] } = {},
): PageListItem[] {
  const pagesDir = join(mechDir, 'pages')
  if (!fs.existsSync(pagesDir)) return []

  const items: PageListItem[] = []
  for (const relative of fs.readdirSync(pagesDir, { recursive: true }) as string[]) {
    if (!relative.endsWith(EXT)) continue

    const parsed = parse(relative)
    const dir = parsed.dir.replace(/\\/g, '/')
    const base = parsed.base.slice(0, -EXT.length)
    const page = readFile(join(pagesDir, relative))
    const path = `/${dir}/${base === 'index' ? '' : base}`.replace('//', '/').replace(/\/$/, '') || '/'

    const embedded: Record<string, unknown> = {}
    for (const entry of options.data ?? []) embedded[entry.id] = page.data?.[entry.id] ?? {}

    items.push({
      path,
      name: page.name ?? base,
      folderPath: dir === '' ? null : dir,
      order: page.order ?? 0,
      orderAfter: page.orderAfter ?? null,
      draft: page.draft === true,
      ...embedded,
    })
  }

  return items.sort(comparePages)
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
