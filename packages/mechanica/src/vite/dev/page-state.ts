import { readPage, pageVersion } from './pages-store'
import { readSiteData, readFolderData, folderOf } from './data-store'

/**
 * The dev state for a page: effective data resolved site < folder < page, plus
 * the scope buckets the editor edits, and the page's on-disk version for
 * optimistic-concurrency saves. Injected as `window.state` on page load and
 * served by `GET /@mechanica/state` when the editor refreshes after an
 * external change.
 */
export function buildPageState(mechDir: string, urlPath: string) {
  const page = readPage(mechDir, urlPath)
  const folder = folderOf(mechDir, urlPath)
  const siteData = readSiteData(mechDir)
  const folderData = readFolderData(mechDir, folder)
  const pageData = page.data ?? {}
  return {
    content: page.content ?? [],
    data: { ...siteData, ...folderData, ...pageData },
    siteData,
    folderData,
    pageData,
    folder,
    page: { path: urlPath, meta: page.meta ?? {} },
    version: pageVersion(mechDir, urlPath),
  }
}
