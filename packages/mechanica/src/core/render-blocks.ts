import { h, type VNode } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import type { BlocksMap } from './state'

/**
 * Render a content tree into Vue VNodes, resolving each block by id from
 * `blocks` and recursing into array or named-slot children.
 *
 * Unknown block ids render to `null` (skipped) rather than throwing, so a page
 * authored against a newer block set still renders the rest.
 */
export function renderBlocks(
  blocks: ContentBlock[],
  map: BlocksMap,
  baseKey?: string,
): (VNode | null)[] {
  return blocks.map((item, index) => {
    const component = map.get(item.blockId)
    if (!component) return null

    const props = { ...item.data, key: baseKey ? baseKey + index : item.id }

    if (!item.children) return h(component, props)

    const slotLists = Array.isArray(item.children) ? { default: item.children } : item.children
    const slots: Record<string, () => (VNode | null)[]> = {}
    for (const name in slotLists) {
      slots[name] = () => renderBlocks(slotLists[name]!, map)
    }

    return h(component, props, slots)
  })
}
