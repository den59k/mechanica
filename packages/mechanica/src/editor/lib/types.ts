import type { SaveStatus } from './save-queue'

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

/** The save surface exposed to the editor UI (toolbar indicator + actions). */
export interface SaveController {
  readonly status: SaveStatus
  /** Re-send after a failure. */
  retry(): void
  /** Conflict resolution: overwrite the on-disk page with the local edits. */
  keepMine?(): void
  /** Conflict resolution: drop local edits and reload the page from disk. */
  reloadFromDisk?(): void
}
