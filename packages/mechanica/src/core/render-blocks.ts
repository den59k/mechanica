import { h, type VNode } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import type { BlocksMap } from './state'

/**
 * Render a content tree into Vue VNodes, resolving each block by id from
 * `blocks` and recursing into array or named-slot children.
 *
 * `keyPrefix` namespaces the vnode keys (still per content node): passing a
 * different prefix forces every block to remount even when the tree is the
 * same — paginated variants of a page use this to re-run mount-time queries.
 *
 * Unknown block ids render to `null` (skipped) rather than throwing, so a page
 * authored against a newer block set still renders the rest.
 */
export function renderBlocks(
  blocks: ContentBlock[],
  map: BlocksMap,
  keyPrefix?: string,
): (VNode | null)[] {
  return blocks.map((item, index) => {
    const component = map.get(item.blockId)
    if (!component) return null

    const props = {
      ...item.data,
      key: (keyPrefix ?? '') + (item.id ?? index),
      // Lets the editor map a rendered element back to its content node.
      'data-block-id': item.id,
    }

    if (!item.children) return h(component, props)

    const slotLists = Array.isArray(item.children) ? { default: item.children } : item.children
    const slots: Record<string, () => (VNode | null)[]> = {}
    for (const name in slotLists) {
      slots[name] = () => renderBlocks(slotLists[name]!, map)
    }

    return h(component, props, slots)
  })
}
