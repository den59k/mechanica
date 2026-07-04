import { h, type VNode } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { placementStyle } from '../elements/style-vars'
import type { BlocksMap } from './state'

/** Built-in composer elements (`mech:frame` / `text` / `image`) apply their own
 *  margin / `$abs`; any other block that carries placement data gets wrapped. */
const isElementBlock = (blockId: string): boolean => blockId.startsWith('mech:')

/**
 * Render a content tree into Vue VNodes, resolving each block by id from
 * `blocks` and recursing into array or named-slot children.
 *
 * `keyPrefix` namespaces the vnode keys (still per content node): passing a
 * different prefix forces every block to remount even when the tree is the
 * same — paginated variants of a page use this to re-run mount-time queries.
 *
 * A non-element block placed in a composed template can carry **placement**
 * data — `margin` and/or absolute `$abs`. Those are layout, not component props,
 * and a component's own root can't be styled from here, so such a block is
 * wrapped in a `.mxel` positioning div that owns the placement style + the
 * editor `data-block-id`. Elements handle their own placement inline, so they
 * are never wrapped (and blocks with no placement data render unchanged).
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

    const key = (keyPrefix ?? '') + (item.id ?? index)
    const placement = isElementBlock(item.blockId) ? null : placementStyle(item.data)

    const props: Record<string, unknown> = { ...item.data, key }
    if (placement) {
      // Placement keys are layout, never component props — strip them so the
      // component sees a clean prop set; the wrapper carries them instead.
      delete props.margin
      delete props.$abs
    } else {
      // Lets the editor map a rendered element back to its content node.
      props['data-block-id'] = item.id
    }

    let node: VNode
    if (!item.children) {
      node = h(component, props)
    } else {
      const slotLists = Array.isArray(item.children) ? { default: item.children } : item.children
      const slots: Record<string, () => (VNode | null)[]> = {}
      for (const name in slotLists) {
        slots[name] = () => renderBlocks(slotLists[name]!, map)
      }
      node = h(component, props, slots)
    }

    if (!placement) return node
    return h('div', { class: 'mxel mxel-slot', style: placement, key, 'data-block-id': item.id }, [node])
  })
}
