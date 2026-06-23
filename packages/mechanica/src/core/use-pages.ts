import { runQuery } from './query'
import type { DataHook } from './define-data'

export interface UsePagesFilter<T extends readonly DataHook<any, any>[]> {
  /** Only pages within this folder id. */
  folderId?: number
  /** Only pages within this folder path. */
  folderName?: string
  /** Data hooks whose page-scoped values to include in each result. */
  data?: T
}

/** A page entry plus the requested per-page data values. */
export type PageQueryResult<T extends readonly DataHook<any, any>[]> = { path: string } & {
  [K in T[number] as K['id']]: ReturnType<K>
}

/**
 * List the site's pages (optionally filtered), with selected page-scoped data
 * merged into each result. Resolves per the current mode.
 */
export function usePages<const T extends readonly DataHook<any, any>[] = []>(
  filter?: UsePagesFilter<T>,
): PageQueryResult<T>[] {
  const key = 'getPages.' + JSON.stringify(filter ?? {})
  return runQuery(key, [] as PageQueryResult<T>[])
}
