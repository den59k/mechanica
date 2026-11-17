import type { Block, ContentBlock } from 'mechanica-shared'
import { createContentBlock } from './block-meta'
import type { DropPosition } from './content-tree'

/**
 * Pure logic of page templates (`defineBlock({ page: true })`).
 *
 * A page whose only root block is a page template is a *template page*: that
 * block is the page. The editor store locks it (no selecting, moving,
 * duplicating or removing, nothing placed beside it) and shows its props as the
 * page's own. The mode is read off the content, so the page file needs no flag.
 */

/** The page's template block — only when that block IS the whole page. */
export function pageTemplateBlock(
  content: ContentBlock[],
  blocksById: Map<string, Block>,
): ContentBlock | undefined {
  if (content.length !== 1) return undefined
  const only = content[0]!
  return blocksById.get(only.blockId)?.page ? only : undefined
}

/**
 * Whether a drop would put a block at the root, next to the template block.
 * Drops inside the template (its slots) and anywhere deeper stay allowed.
 */
export function dropsBesideTemplate(template: ContentBlock, drop: DropPosition): boolean {
  if (drop.anchorId === null) return true
  return drop.anchorId === template.id && drop.position !== 'inside'
}

/** The template's first slot, where a block added without a target goes. */
export function templateSlot(template: ContentBlock, blocksById: Map<string, Block>): string | undefined {
  return Object.keys(blocksById.get(template.blockId)?.slots ?? {})[0]
}

/**
 * Take the template off the page, leaving it empty and ready for blocks. This
 * is the only way out of a template page, since its block cannot be deleted.
 * Asks first (the template's values go with it; undoable). Returns whether
 * the page changed.
 */
export function clearPageTemplate(
  content: ContentBlock[],
  blocksById: Map<string, Block>,
  confirmClear: (message: string) => boolean,
): boolean {
  const current = pageTemplateBlock(content, blocksById)
  if (!current) return false
  const name = blocksById.get(current.blockId)?.name ?? current.blockId
  if (!confirmClear(`Remove the “${name}” template? The page becomes empty, ready for blocks (undoable).`)) {
    return false
  }
  content.splice(0, content.length)
  return true
}

/**
 * Make `meta` the page's entire content (a fresh block with schema defaults).
 * Filling an empty page or swapping one template for another applies silently;
 * replacing hand-arranged content goes through `confirmReplace` first
 * (everything is undoable either way). Returns the placed block, or null when
 * nothing changed.
 */
export function applyPageBlock(
  content: ContentBlock[],
  meta: Block,
  blocksById: Map<string, Block>,
  confirmReplace: (message: string) => boolean,
): ContentBlock | null {
  const current = pageTemplateBlock(content, blocksById)
  if (current?.blockId === meta.id) return null
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
