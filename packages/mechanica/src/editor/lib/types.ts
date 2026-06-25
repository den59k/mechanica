/**
 * A serialized snapshot of the page produced by the editor on each edit. Data is
 * split into scope buckets so the dev server can persist each level (site → the
 * shared data file, folder → its folder, page → the page file).
 */
export interface EditorSnapshot {
  content: unknown[]
  siteData: Record<string, unknown>
  folderData: Record<string, unknown>
  pageData: Record<string, unknown>
}
