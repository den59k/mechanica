import type { Block, ContentBlock } from 'mechanica-shared'
import { createContentBlock } from './block-meta'

/**
 * Pure logic behind the Page setup pane's "Page block" select (PageSettings.vue):
 * turning a page into — or between — single-standalone-block pages.
 */

/** The page's standalone block id — only when that block IS the whole page. */
export function standalonePageBlockId(
  content: ContentBlock[],
  blocksById: Map<string, Block>,
): string | undefined {
  if (content.length !== 1) return undefined
  const only = content[0]!
  return blocksById.get(only.blockId)?.standalone ? only.blockId : undefined
}

/**
 * Make `meta` the page's entire content (a fresh block with schema defaults).
 * Filling an empty page or swapping one standalone block for another applies
 * silently; replacing hand-arranged content goes through `confirmReplace`
 * first (everything is undoable either way). Returns the placed block, or
 * null when nothing changed.
 */
export function applyPageBlock(
  content: ContentBlock[],
  meta: Block,
  blocksById: Map<string, Block>,
  confirmReplace: (message: string) => boolean,
): ContentBlock | null {
  const current = standalonePageBlockId(content, blocksById)
  if (current === meta.id) return null
  if (content.length && current === undefined) {
    const what = content.length === 1 ? 'its current block' : `its ${content.length} blocks`
    if (!confirmReplace(`Make “${meta.name}” this page's content? The page loses ${what} (undoable).`)) {
      return null
    }
  }
  const block = createContentBlock(meta)
  content.splice(0, content.length, block)
  return block
}
