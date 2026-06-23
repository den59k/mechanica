import fs from 'node:fs'
import { dirname, join, parse } from 'node:path'

/** Shape of a page JSON file under `<mech>/pages`. */
export interface PageFile {
  content: unknown[]
  data: Record<string, unknown>
  name?: string
  path?: string
  meta?: Record<string, unknown>
  order?: number
  orderAfter?: string | null
  id?: number
}

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

/** Resolve a URL path to its page JSON file under `<mechDir>/pages`. */
export function getPagePath(mechDir: string, urlPath: string): string {
  const pagesDir = join(mechDir, 'pages')
  const normalized = urlPath.trim().replace(/\/+$/, '').replace(/^\/+/, '')
  const asDirectory = fs.statSync(join(pagesDir, normalized), { throwIfNoEntry: false })?.isDirectory()
  const relative = asDirectory ? join(normalized, 'index.json') : `${normalized}.json`
  return join(pagesDir, relative)
}

/** Read a page file, returning an empty page when it does not exist. */
export function readPage(mechDir: string, urlPath: string): PageFile {
  const file = getPagePath(mechDir, urlPath)
  if (!fs.existsSync(file)) return emptyPage()
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

/** Create a new page, throwing {@link PageExistsError} if it already exists. */
export function createPage(
  mechDir: string,
  input: { path: string; name: string; folderId?: string },
): PageFile {
  const folderPrefix = typeof input.folderId === 'string' ? `/${input.folderId}` : ''
  const file = getPagePath(mechDir, folderPrefix + input.path.trim())
  if (fs.existsSync(file)) throw new PageExistsError(input.path)

  fs.mkdirSync(dirname(file), { recursive: true })
  const page: PageFile = { content: [], data: {}, name: input.name, path: input.path }
  fs.writeFileSync(file, JSON.stringify(page, null, 2))

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

  fs.mkdirSync(dirname(file), { recursive: true })
  const page: PageFile = {
    content: source.content ?? [],
    data: source.data ?? {},
    meta: source.meta,
    name: input.name,
    path: input.path,
  }
  fs.writeFileSync(file, JSON.stringify(page, null, 2))

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

/** Merge content/data into a page and persist it. */
export function savePage(
  mechDir: string,
  urlPath: string,
  patch: { content?: unknown[]; data?: Record<string, unknown> },
): void {
  const file = getPagePath(mechDir, urlPath)
  const page = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as PageFile) : emptyPage()
  if (patch.content !== undefined) page.content = patch.content
  if (patch.data !== undefined) page.data = patch.data
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(page, null, 2))
}

/** Update a page's name and meta. */
export function updatePageMeta(
  mechDir: string,
  urlPath: string,
  meta: { name?: string; title?: string; description?: string },
): void {
  const file = getPagePath(mechDir, urlPath)
  const page = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as PageFile) : emptyPage()
  if (meta.name !== undefined) page.name = meta.name
  page.meta = { ...page.meta, title: meta.title, description: meta.description }
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(page, null, 2))
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
    if (!relative.endsWith('.json')) continue

    const parsed = parse(relative)
    const dir = parsed.dir.replace(/\\/g, '/')
    const page = JSON.parse(fs.readFileSync(join(pagesDir, relative), 'utf-8')) as PageFile
    const path =
      `/${dir}/${parsed.name === 'index' ? '' : parsed.name}`.replace('//', '/').replace(/\/$/, '') || '/'

    const embedded: Record<string, unknown> = {}
    for (const entry of options.data ?? []) embedded[entry.id] = page.data?.[entry.id] ?? {}

    items.push({
      path,
      name: page.name ?? parsed.name,
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
