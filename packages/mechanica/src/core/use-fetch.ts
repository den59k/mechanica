import { runQuery } from './query'

export interface UseFetchOptions extends RequestInit {
  url: string
}

/**
 * Fetch external JSON, resolved during SSR and hydrated on the client. Returns a
 * reactive container that fills in when the request completes.
 */
export function useFetch<T extends object = Record<string, unknown>>(options: UseFetchOptions): T {
  const key = 'fetch.' + JSON.stringify(options)
  return runQuery(key, {} as T)
}
