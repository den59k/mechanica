import { resolveQueryKey, type QueryContext, type QuerySource } from 'mechanica-shared'
import { listPages } from './pages-store'

/**
 * The dev server's {@link QuerySource}: pages come live from the `.mech`
 * store; `useFetch` URLs are fetched server-side (no CORS, matching how the
 * export resolves them at build time).
 */
export function devQuerySource(mechDir: string): QuerySource {
  return {
    listPages: (options) => listPages(mechDir, options),
    fetchJson: async ({ url, ...init }) => {
      const res = await fetch(url, init as RequestInit)
      if (!res.ok) throw new Error(`${url} responded ${res.status}`)
      return res.json()
    },
  }
}

/**
 * Resolve a dev-mode query key against the local `.mech` store. Keys are of the
 * form `"<type>.<json-args>"` (the same encoding the runtime composables use);
 * `context.page` selects the chunk of a paginated query.
 */
export function resolveDevQuery(mechDir: string, key: string, context: QueryContext = {}): Promise<unknown> {
  return resolveQueryKey(devQuerySource(mechDir), key, context)
}
