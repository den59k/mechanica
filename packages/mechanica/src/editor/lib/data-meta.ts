import type { DataEntry } from 'mechanica-shared'
import { isUnderFolder } from './block-meta'

/**
 * Whether the editor's Data dialog offers a `defineData` entry on a page in
 * `folder` (null = root). An entry without `folder` is offered everywhere; with
 * `folder` it is offered only under that folder (nested folders match by prefix,
 * so `'examples'` covers `examples/advanced` too). This only filters what the
 * dialog *draws* — the value's scope and where it is stored are unaffected.
 */
export function dataEntryAvailableIn(entry: DataEntry, folder: string | null): boolean {
  if (!entry.folder) return true
  return isUnderFolder(folder, entry.folder)
}
