import type { PageMeta } from 'mechanica-shared'
import { readPage, pageVersion, fillContentDefaults, fillImageMeta } from './pages-store'
import { readSiteData, readFolderData, folderOf } from './data-store'

/**
 * Recognize a paginated variant URL (`/blog/2`): no page file of its own, a
 * numeric tail ≥ 2, and an existing base page. Returns the base path + number.
 */
function paginatedVariantOf(
  mechDir: string,
  urlPath: string,
): { basePath: string; page: number } | null {
  const match = urlPath.match(/^(.*)\/(\d+)$/)
  if (!match) return null
  const page = Number(match[2])
  if (page < 2) return null
  if (pageVersion(mechDir, urlPath) != null) return null // a real page wins
  const basePath = match[1] || '/'
  if (pageVersion(mechDir, basePath) == null) return null
  return { basePath, page }
}

/**
 * The dev state for a page: effective data resolved site < folder < page, plus
 * the scope buckets the editor edits, and the page's on-disk version for
 * optimistic-concurrency saves. Injected as `window.state` on page load and
 * served by `GET /@mechanica/state` when the editor refreshes after an
 * external change.
 *
 * A paginated variant URL (`/blog/2`) serves its base page's state with
 * `page.pagination` set — `page.path` stays the base path, so editing the
 * variant edits (and saves to) the real page.
 */
export function buildPageState(mechDir: string, urlPath: string) {
  const variant = paginatedVariantOf(mechDir, urlPath)
  const pagePath = variant?.basePath ?? urlPath

  const page = readPage(mechDir, pagePath)
  const content = page.content ?? []
  // Bake block-prop defaults into the state, like `generatePage` does at
  // export — a hand-authored page omitting a defaulted prop renders the same
  // in dev and production (blocks never apply defaults at render time).
  fillContentDefaults(content)
  // Inject cached image metadata (LQIP previews, dimensions) from
  // `.mech/images.json` — page files don't carry the preview blobs.
  fillImageMeta(mechDir, content)
  const folder = folderOf(mechDir, pagePath)
  const siteData = readSiteData(mechDir)
  const folderData = readFolderData(mechDir, folder)
  const pageData = page.data ?? {}
  const pageMeta: PageMeta = { path: pagePath, meta: page.meta ?? {} }
  if (variant) pageMeta.pagination = { page: variant.page }
  return {
    content,
    data: { ...siteData, ...folderData, ...pageData },
    siteData,
    folderData,
    pageData,
    folder,
    page: pageMeta,
    version: pageVersion(mechDir, pagePath),
  }
}
