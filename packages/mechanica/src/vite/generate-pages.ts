import { localePath, type LocalesConfig, type VirtualPage } from 'mechanica-shared'

/**
 * Programmatic route generation (`generatePages`).
 *
 * A provider turns some source — a glob of Markdown, a CMS, anything — into a
 * list of {@link VirtualPage}s: pages with no `.page.md` file, rendered through
 * the normal pipeline. The plugin runs `list` at build and bakes the output
 * into the SSR bundle for the static export (see `generateSsrEntry`), and runs
 * it at dev-server start into a route map.
 *
 * These are build-side types (a provider gets fs paths) — they live with the
 * plugin options, not in the `mechanica-shared` barrel the client imports.
 * `resolve`/`revalidate` are reserved for the future render backend (render one
 * path on a webhook without enumerating the whole source); Phase 1 uses `list`.
 */
export interface PageProviderCtx {
  /** The Vite project root (absolute). */
  root: string
  /** The project's `.mech` directory (absolute). */
  mechDir: string
  /** The site's locale config, or null when i18n is off. */
  locales: LocalesConfig | null
}

export type PageProvider =
  | ((ctx: PageProviderCtx) => VirtualPage[] | Promise<VirtualPage[]>)
  | {
      /** Enumerate every page (static export, sitemap, dev route map). */
      list: (ctx: PageProviderCtx) => VirtualPage[] | Promise<VirtualPage[]>
      /** Reserved: render one path without enumerating — backend ISR / lazy dev. */
      resolve?: (path: string, ctx: PageProviderCtx) => VirtualPage | null | Promise<VirtualPage | null>
      /** Reserved: cache/revalidation hint for the backend. */
      revalidate?: number | ((page: VirtualPage) => number)
    }

/** Run every provider's `list` once and flatten the results. */
export async function collectGeneratedPages(
  providers: PageProvider[] | undefined,
  ctx: PageProviderCtx,
): Promise<VirtualPage[]> {
  if (!providers?.length) return []
  const lists = await Promise.all(providers.map((p) => (typeof p === 'function' ? p : p.list)(ctx)))
  return lists.flat()
}

/** The served (locale-prefixed) URL a generated page renders at. */
export function generatedServedPath(page: VirtualPage, config: LocalesConfig | null): string {
  if (!config || !page.locale || page.locale === config.default) return page.path
  return localePath(page.path, page.locale, config)
}
