/**
 * The inspector's optional-property registry. The inspector shows a slim core
 * (size, layout, typography) and everything else — padding, margin, fill,
 * radius, content width, absolute position — is *added on demand* via the
 * "+ Add" menu, Framer-style. A property row is visible when the node's data
 * already carries it (base or any `$bp` layer) or when it was added this
 * session; removing a row deletes the underlying data keys everywhere. Pure
 * and unit-tested.
 */

import type { ContentBlock } from 'mechanica-shared'
import type { ElementKind } from './elements-meta'

export interface OptionalProp {
  key: string
  title: string
  /** VIcon name shown in the add-menu. */
  icon: string
  /** Which element kinds can add it. */
  kinds: ElementKind[]
  /** The data keys this property owns — checked for presence, deleted on remove. */
  dataKeys: string[]
  /** The root frame can't take it (position: the root *is* the block). */
  notRoot?: boolean
}

export const OPTIONAL_PROPS: OptionalProp[] = [
  { key: 'padding', title: 'Padding', icon: 'sides', kinds: ['frame'], dataKeys: ['padding'] },
  { key: 'margin', title: 'Margin', icon: 'margin', kinds: ['frame', 'text', 'image'], dataKeys: ['margin'] },
  { key: 'maxWidth', title: 'Content width', icon: 'width', kinds: ['frame'], dataKeys: ['maxWidth'] },
  { key: 'background', title: 'Fill', icon: 'fill', kinds: ['frame'], dataKeys: ['background'] },
  { key: 'radius', title: 'Radius', icon: 'corner', kinds: ['frame', 'image'], dataKeys: ['radius'] },
  { key: 'position', title: 'Position', icon: 'position', kinds: ['frame', 'text', 'image'], dataKeys: ['$abs'], notRoot: true },
]

export function optionalProp(key: string): OptionalProp | null {
  return OPTIONAL_PROPS.find((p) => p.key === key) ?? null
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every data layer of a node: base + each `$bp` breakpoint override. */
function dataLayers(node: ContentBlock): Record<string, unknown>[] {
  const layers: Record<string, unknown>[] = [node.data]
  const bp = node.data.$bp
  if (isObject(bp)) {
    for (const layer of Object.values(bp)) if (isObject(layer)) layers.push(layer)
  }
  return layers
}

/** Whether the node's data (any layer) already carries this property. */
export function propPresent(node: ContentBlock, prop: OptionalProp): boolean {
  const layers = dataLayers(node)
  return prop.dataKeys.some((key) => layers.some((layer) => key in layer))
}

/** The properties this element could have (before filtering already-added ones). */
export function availableProps(kind: ElementKind | null, isRoot: boolean): OptionalProp[] {
  if (!kind) return []
  return OPTIONAL_PROPS.filter((p) => p.kinds.includes(kind) && !(isRoot && p.notRoot))
}
