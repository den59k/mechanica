/**
 * A tiny in-memory clipboard for the composer, shared across composed blocks in
 * the same session (module-level, so copy in one block → paste in another).
 * Nodes are deep-cloned with fresh ids on both store and read, so the buffer is
 * independent of the source and every paste yields unique ids.
 */
import type { ContentBlock } from 'mechanica-shared'
import { cloneBlock } from '../../lib/content-tree'

let buffer: ContentBlock[] = []

/** Snapshot the given nodes into the clipboard (detached deep copies). */
export function setClipboard(nodes: ContentBlock[]): void {
  buffer = nodes.map(cloneBlock)
}

/** Fresh clones (new ids) of the clipboard contents, ready to insert. */
export function readClipboard(): ContentBlock[] {
  return buffer.map(cloneBlock)
}

/** Empty the clipboard — used by tests to reset the module-level buffer. */
export function clearClipboard(): void {
  buffer = []
}
