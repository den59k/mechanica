import fs from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { parsePage, serializePage, type ContentBlock, type PageDoc } from '@mechanica/shared'

/** Shape of a page file under `<mech>/pages` (the parsed `.page.md` document). */
export type PageFile = PageDoc

/** File extension for page documents under `<mech>/pages`. */
const EXT = '.page.md'

/** A page entry as returned by {@link listPages}. */
export interface PageListItem {
  path: string
  name: string
  folderPath: string | null
  order: number
  orderAfter: string | null
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

const readFile = (file: string): PageFile => parsePage(fs.readFileSync(file, 'utf-8'))

const writeFile = (file: string, page: PageFile): void => {
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, serializePage(page))
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
  return readFile(file)
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
  }
  writeFile(file, page)

  return { ...page, path: folderPrefix + input.path.trim() }
}

/** Delete a page; also removes a now-empty folder directory. Returns whether it existed. */
export function deletePage(mechDir: string, urlPath: string): boolean {
  const file = getPagePath(mechDir, urlPath)
  if (!fs.existsSync(file)) return false
  fs.rmSync(file)

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
    const dir = dirname(file)
    const pagesDir = join(mechDir, 'pages')
    if (dir !== pagesDir && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmSync(dir, { recursive: true })
    }
  }
  return { path: cleaned }
}

/** Merge content/data into a page and persist it. */
export function savePage(
  mechDir: string,
  urlPath: string,
  patch: { content?: unknown[]; data?: Record<string, unknown> },
): void {
  const file = getPagePath(mechDir, urlPath)
  const page = fs.existsSync(file) ? readFile(file) : emptyPage()
  if (patch.content !== undefined) page.content = patch.content as ContentBlock[]
  if (patch.data !== undefined) page.data = patch.data
  writeFile(file, page)
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
