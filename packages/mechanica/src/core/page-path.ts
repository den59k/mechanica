import { localePath, paginationVariantPath, type LocalesConfig, type PageMeta } from 'mechanica-shared'

/**
 * The address a page's state is served at: its logical `path` under the
 * locale prefix (`/about` -> `/ru/about`) plus the pagination variant suffix
 * (`/blog` -> `/blog/2`). This is what the browser shows in the address bar for
 * that state, so the server-side router starts there and `<Link>` resolves the
 * same `is-active` on both sides of hydration.
 *
 * The export already serves a variant under its own path (`page.path` is
 * `/blog/2` there, while dev keeps the base `/blog`); a suffix that is
 * already present is kept, as `usePagination().pathFor` does.
 */
export function servedPagePath(page: PageMeta | undefined, locales?: LocalesConfig | null): string {
  const localized = localePath(page?.path || '/', page?.locale, locales)
  const variant = page?.pagination?.page ?? 1
  if (variant > 1 && localized.endsWith(`/${variant}`)) return localized
  return paginationVariantPath(localized, variant)
}
