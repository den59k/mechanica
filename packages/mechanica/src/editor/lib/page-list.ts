import type { EditorPageListing } from 'mechanica-shared'
import { editorBackend } from './backend'

/** A page as the editor's host lists it. */
export type PageItem = EditorPageListing

let pagesPromise: Promise<PageItem[]> | null = null

/**
 * Fetch the project's pages from the dev server, memoized for the session so
 * many link fields share one request. Resolves to `[]` when unavailable.
 */
export function fetchPages(): Promise<PageItem[]> {
  if (!pagesPromise) {
    pagesPromise = editorBackend()
      .pages.list()
      .catch(() => [] as PageItem[])
  }
  return pagesPromise
}

/**
 * The URL of a page's thumbnail (written by `mechanica thumbs` into
 * `.mech/thumbs/`). The file may not exist — callers need a fallback.
 */
export function pageThumbUrl(path: string): string {
  return editorBackend().urls.pageThumb(path)
}

/**
 * Derive a URL path from a page name: a lowercase ASCII slug, prefixed with
 * the folder when given (`("Getting Started", "docs")` → `/docs/getting-started`).
 * The page form uses it to keep the path following the name until the user
 * edits the path by hand.
 */
export function pathFromName(name: string, folder?: string | null): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const parts = [folder?.replace(/^\/+|\/+$/g, ''), slug].filter(Boolean)
  return '/' + parts.join('/')
}

/** Filter pages by a free-text query matched against both name and path. */
export function filterPages<T extends PageItem>(pages: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return pages
  return pages.filter((page) => `${page.name} ${page.path}`.toLowerCase().includes(q))
}

/** A folder section: its folder path (null = root) and the pages inside it. */
export interface PageGroup<T extends PageItem = PageItem> {
  folder: string | null
  pages: T[]
}

/**
 * Group pages by folder for display: root-level pages first (folder `null`),
 * then each folder alphabetically. Page order within a group is preserved (the
 * server already sorts them).
 */
export function groupPagesByFolder<T extends PageItem>(pages: T[]): PageGroup<T>[] {
  const groups = new Map<string | null, T[]>()
  for (const page of pages) {
    const folder = page.folderPath ?? null
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder)!.push(page)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
    .map(([folder, items]) => ({ folder, pages: items }))
}
