import { resolveQueryKey, type QueryContext, type QuerySource, type VirtualPage } from 'mechanica-shared'
import { listPages } from './pages-store'
import type { Mech } from './content-files'

/**
 * The dev server's {@link QuerySource}: pages come live from the `.mech`
 * store; `useFetch` URLs are fetched server-side (no CORS, matching how the
 * export resolves them at build time). `generated` pages (plugin `generatePages`)
 * are merged into the page listing so `usePages()` sees them, like the export.
 */
export function devQuerySource(mech: Mech, generated?: VirtualPage[]): QuerySource {
  return {
    listPages: (options) => listPages(mech, { ...options, generated }),
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
export function resolveDevQuery(
  mech: Mech,
  key: string,
  context: QueryContext = {},
  generated?: VirtualPage[],
): Promise<unknown> {
  return resolveQueryKey(devQuerySource(mech, generated), key, context)
}
