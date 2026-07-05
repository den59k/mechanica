import { parseLocalePath, type LocalesConfig, type PageMeta } from 'mechanica-shared'
import {
  readPage,
  pageVersion,
  translationsOf,
  fillContentDefaults,
  fillImageMeta,
} from './pages-store'
import { readSiteData, readFolderData, folderOf } from './data-store'

/**
 * Recognize a paginated variant URL (`/blog/2`): no page file of its own, a
 * numeric tail ≥ 2, and an existing base page. Returns the base path + number.
 * Checked against the default-locale (base) files — pagination structure is
 * defined by the logical page, and variant URLs never have their own file.
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
 *
 * A locale-prefixed URL (`/ru/about`) serves that page's translation: the
 * prefix is stripped to the logical path, `page.locale`/`page.locales` are set,
 * and the version targets the translation file. When no translation exists the
 * default-locale content renders as a fallback (`page.localeFallback`).
 */
export function buildPageState(
  mechDir: string,
  urlPath: string,
  config?: LocalesConfig | null,
) {
  // Strip a locale prefix first, then detect a pagination variant on the
  // logical path — `/ru/blog/2` composes as locale `ru`, base `/blog`, page 2.
  const { locale, path: localePathStripped } = parseLocalePath(urlPath, config)
  const variant = paginatedVariantOf(mechDir, localePathStripped)
  const pagePath = variant?.basePath ?? localePathStripped

  const isDefaultLocale = !config || locale === config.default
  const localeCode = isDefaultLocale ? undefined : locale

  // Read the requested locale's translation; fall back to the default-locale
  // content when the page isn't translated yet (the editor flags it).
  let fallback = false
  let page = readPage(mechDir, pagePath, localeCode)
  if (localeCode && pageVersion(mechDir, pagePath, localeCode) == null) {
    page = readPage(mechDir, pagePath)
    fallback = true
  }

  const content = page.content ?? []
  // Bake block-prop defaults into the state, like `generatePage` does at
  // export — a hand-authored page omitting a defaulted prop renders the same
  // in dev and production (blocks never apply defaults at render time).
  fillContentDefaults(content)
  // Inject cached image metadata (LQIP previews, dimensions) from
  // `.mech/images.json` — page files don't carry the preview blobs.
  fillImageMeta(mechDir, content)
  const folder = folderOf(mechDir, pagePath)
  // `localized` site/folder data resolves to the current locale (falling back to
  // the default per entry); non-localized entries come from the shared files.
  const siteData = readSiteData(mechDir, localeCode)
  const folderData = readFolderData(mechDir, folder, localeCode)
  const pageData = page.data ?? {}
  const pageMeta: PageMeta = { path: pagePath, meta: page.meta ?? {} }
  if (variant) pageMeta.pagination = { page: variant.page }
  if (config) {
    pageMeta.locale = locale
    pageMeta.locales = translationsOf(mechDir, pagePath, config)
    if (fallback) pageMeta.localeFallback = true
  }
  return {
    content,
    data: { ...siteData, ...folderData, ...pageData },
    siteData,
    folderData,
    pageData,
    folder,
    page: pageMeta,
    version: pageVersion(mechDir, pagePath, localeCode),
    ...(config ? { locales: config } : {}),
  }
}
