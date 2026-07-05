import { getValueByPath } from './schema'

/**
 * The query engine: resolves the runtime's query keys (`usePages`,
 * `usePagination`, `useFetch`) against an abstract {@link QuerySource}. One
 * implementation, three callers — the dev server (live `.mech` store), the
 * static export (resolved at build time and baked into `window.state.query`),
 * and a future hosted backend (its own source). Pure and DOM/fs-free; the
 * source supplies all I/O.
 */

/** A page entry as the engine consumes it (requested data entries embedded). */
export interface PageQueryItem {
  path: string
  name: string
  folderPath?: string | null
  order?: number
  orderAfter?: string | null
  /** Draft pages are dropped from query results (see {@link resolvePagesQuery}). */
  draft?: boolean
  [dataId: string]: unknown
}

/** What a caller must supply for the engine to resolve queries. */
export interface QuerySource {
  /**
   * List all pages, with the requested page-scoped data entries embedded. With
   * a `locale` (a non-default code) only pages translated to it are listed, and
   * each item's data/name come from the translation — so a translated listing
   * shows translated content and never links to an untranslated page.
   */
  listPages(options: { data?: { id: string }[]; locale?: string }): PageQueryItem[]
  /** Fetch external JSON (`useFetch`). Omit to disable fetch queries. */
  fetchJson?(options: { url: string } & Record<string, unknown>): Promise<unknown>
}

/** Arguments of a `getPages` query (the JSON part of its key). */
export interface PagesQueryArgs {
  /** Only pages inside this folder path (e.g. `'blog'`). */
  folderName?: string
  /** Page-scoped data entries to embed in each result. */
  data?: { id: string }[]
  /**
   * Sort field: `'name'`, `'path'`, or a dotted path into an included data
   * entry (e.g. `'postMeta.date'`). Default: the store's page order.
   */
  sort?: { by: string; dir?: 'asc' | 'desc' }
  /** Cap the number of results (non-paginated queries). */
  limit?: number
  /** Split results into pages of this size — the query becomes paginated. */
  pageSize?: number
}

/** The shape a paginated `getPages` query resolves to. */
export interface PaginatedPagesResult {
  items: PageQueryItem[]
  /** Current page number (1-based, clamped to `pageCount`). */
  page: number
  pageCount: number
  pageSize: number
  total: number
}

/** Extra context for resolving a key (which paginated variant to slice). */
export interface QueryContext {
  /** 1-based page number for paginated queries. Default 1. */
  page?: number
  /** The locale to resolve `getPages` against (multi-language sites); a non-default code. */
  locale?: string
}

/** Split a query key (`"<type>.<json-args>"`) into its type and parsed args. */
export function parseQueryKey(key: string): { type: string; args: Record<string, unknown> } {
  const dot = key.indexOf('.')
  if (dot === -1) return { type: key, args: {} }
  const type = key.slice(0, dot)
  const raw = key.slice(dot + 1)
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    return { type, args: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {} }
  } catch {
    return { type, args: {} }
  }
}

/** Whether a key is a paginated `getPages` query (drives export page-splitting). */
export function isPaginatedQuery(key: string): boolean {
  const { type, args } = parseQueryKey(key)
  return type === 'getPages' && typeof args.pageSize === 'number' && args.pageSize > 0
}

/** Compare possibly-missing values: numbers numerically, everything else as strings. */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1 // missing values sort last regardless of direction
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/**
 * Resolve a `getPages` query: filter by folder, sort, and either cap (`limit`)
 * or paginate (`pageSize`). Internal ordering fields are stripped from results.
 */
export function resolvePagesQuery(
  source: QuerySource,
  args: PagesQueryArgs,
  context: QueryContext = {},
): PageQueryItem[] | PaginatedPagesResult {
  // Drafts are never visible to queries (`usePages`/`usePagination`), across
  // every caller (dev server, static export, future backend). On a translated
  // page the listing is resolved in that locale (translated data, translated
  // pages only).
  let pages = source.listPages({ data: args.data, locale: context.locale }).filter((page) => !page.draft)

  if (args.folderName) {
    // "Pages in this folder" means its children — the folder's own index page
    // (usually the page doing the listing) is excluded.
    const indexPath = '/' + args.folderName.replace(/^\/+|\/+$/g, '')
    pages = pages.filter((page) => page.folderPath === args.folderName && page.path !== indexPath)
  }

  if (args.sort?.by) {
    const { by, dir } = args.sort
    const sign = dir === 'desc' ? -1 : 1
    pages = pages
      .map((page) => ({ page, field: getValueByPath(page, by) }))
      .sort((a, b) => {
        // Missing values sort last in either direction.
        if (a.field == null || b.field == null) return compareValues(a.field, b.field)
        return compareValues(a.field, b.field) * sign
      })
      .map((entry) => entry.page)
  }

  const items = pages.map(({ order, orderAfter, folderPath, draft, ...rest }) => rest)

  if (args.pageSize && args.pageSize > 0) {
    const total = items.length
    const pageCount = Math.max(1, Math.ceil(total / args.pageSize))
    const page = Math.min(Math.max(1, context.page ?? 1), pageCount)
    return {
      items: items.slice((page - 1) * args.pageSize, page * args.pageSize),
      page,
      pageCount,
      pageSize: args.pageSize,
      total,
    }
  }

  return typeof args.limit === 'number' && args.limit >= 0 ? items.slice(0, args.limit) : items
}

/**
 * Resolve any query key against a source. Unknown types resolve to `{}` (the
 * runtime containers keep their initial shape). `fetch` keys require the
 * source to provide `fetchJson`.
 */
export async function resolveQueryKey(
  source: QuerySource,
  key: string,
  context: QueryContext = {},
): Promise<unknown> {
  const { type, args } = parseQueryKey(key)

  if (type === 'getPages') return resolvePagesQuery(source, args as PagesQueryArgs, context)

  if (type === 'fetch') {
    if (!source.fetchJson) return {}
    if (typeof args.url !== 'string' || !args.url) return {}
    return source.fetchJson(args as { url: string })
  }

  return {}
}
