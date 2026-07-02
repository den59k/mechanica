import { inject } from 'vue'
import { runQuery } from './query'
import { mechanicaKey } from './state'
import type { DataHook } from './define-data'
import type { UsePagesFilter, PageQueryResult } from './use-pages'

export interface UsePaginationFilter<T extends readonly DataHook<any, any>[]>
  extends Omit<UsePagesFilter<T>, 'limit'> {
  /** Results per page. Makes the query paginated: the export splits the page into `/path/2`, … */
  pageSize: number
}

/** Reactive pagination container returned by {@link usePagination}. */
export interface PaginationResult<T extends readonly DataHook<any, any>[]> {
  /** The current page's slice of results. */
  items: PageQueryResult<T>[]
  /** Current page number (1-based). */
  page: number
  pageCount: number
  pageSize: number
  /** Total results across all pages. */
  total: number
  /** URL of the previous/next page, `null` at the ends. */
  readonly prevPath: string | null
  readonly nextPath: string | null
  /** URL of page `n` (page 1 is the base path, others append `/n`). */
  pathFor(page: number): string
}

/**
 * A paginated page listing. Page 1 renders at the page's own path; the static
 * export renders every further chunk as a real page at `<path>/2`, `<path>/3`,
 * … (each with its own slice baked in), and dev serves those URLs virtually.
 * Use `pathFor`/`prevPath`/`nextPath` to build the pager UI.
 *
 *   const blog = usePagination({ folderName: 'blog', data: [postMeta],
 *     sort: { by: 'postMeta.date', dir: 'desc' }, pageSize: 10 })
 */
export function usePagination<const T extends readonly DataHook<any, any>[] = []>(
  filter: UsePaginationFilter<T>,
): PaginationResult<T> {
  const ctx = inject(mechanicaKey)
  if (!ctx) throw new Error('[mechanica] usePagination used outside a Mechanica app')

  // The variant's page number rides `state.page.pagination` (baked by the
  // export, set by the dev server for virtual `/path/n` URLs).
  const current = ctx.page.pagination?.page ?? 1

  const pathFor = (page: number): string => {
    // The base path: the current path minus a variant suffix, if we're on one.
    let base = ctx.page.path ?? '/'
    const suffix = `/${ctx.page.pagination?.page ?? 1}`
    if ((ctx.page.pagination?.page ?? 1) > 1 && base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length) || '/'
    }
    if (page <= 1) return base
    return `${base === '/' ? '' : base}/${page}`
  }

  const key = 'getPages.' + JSON.stringify(filter)
  return runQuery(key, {
    items: [] as PageQueryResult<T>[],
    page: current,
    pageCount: 1,
    pageSize: filter.pageSize,
    total: 0,
    get prevPath(): string | null {
      return this.page > 1 ? pathFor(this.page - 1) : null
    },
    get nextPath(): string | null {
      return this.page < this.pageCount ? pathFor(this.page + 1) : null
    },
    pathFor,
  })
}
