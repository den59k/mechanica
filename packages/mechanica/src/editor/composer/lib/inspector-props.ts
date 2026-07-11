/**
 * The inspector's optional-property registry. The inspector shows a slim core
 * (size, layout, typography); everything else — padding, margin, fill, radius,
 * content width, absolute position — is a *switch* in the Properties section.
 * Every property a node can carry is listed there; flipping one on activates it
 * and expands its editor. A property counts as active when the node's data
 * already carries it (base or any `$bp` layer) or when it was switched on this
 * session; switching it off deletes the underlying data keys everywhere. Pure
 * and unit-tested.
 */

import type { ContentBlock } from 'mechanica-shared'
import type { ElementKind } from './elements-meta'

export interface OptionalProp {
  key: string
  title: string
  /** VIcon name shown on the property's toggle row. */
  icon: string
  /** Which element kinds can add it. */
  kinds: ElementKind[]
  /** The data keys this property owns — checked for presence, deleted on remove. */
  dataKeys: string[]
  /** The root frame can't take it (position: the root *is* the block). */
  notRoot?: boolean
  /** Also offered on a placed component / composed block — it's placement (the
   *  wrapping `.mxel` div carries it), not a frame-internal knob. */
  component?: boolean
}

export const OPTIONAL_PROPS: OptionalProp[] = [
  { key: 'padding', title: 'Padding', icon: 'sides', kinds: ['frame'], dataKeys: ['padding'] },
  { key: 'margin', title: 'Margin', icon: 'margin', kinds: ['frame', 'text', 'image'], dataKeys: ['margin'], component: true },
  // Size limits — min/max width & height, independent of the Hug/Fill/Fixed Size
  // mode. `maxWidth` on a frame also centers it (the content-column pattern). The
  // root frame carries a default minHeight so it's never zero-height.
  { key: 'limits', title: 'Limits', icon: 'limits', kinds: ['frame', 'text', 'image'], dataKeys: ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] },
  // Fill = color + optional background image (with focal point + color overlay).
  { key: 'background', title: 'Fill', icon: 'fill', kinds: ['frame'], dataKeys: ['background', 'bgImage', 'bgOverlay'] },
  { key: 'radius', title: 'Radius', icon: 'corner', kinds: ['frame', 'image'], dataKeys: ['radius'] },
  // A smartLink target: a linked frame renders as an <a>, a linked text wraps
  // its content in one. Behavior, not styling — base-only, never responsive.
  { key: 'link', title: 'Link', icon: 'link', kinds: ['frame', 'text'], dataKeys: ['link'] },
  // Per-breakpoint visibility — `hide: true` in a `$bp` layer is "hide on mobile".
  { key: 'visibility', title: 'Visibility', icon: 'eye', kinds: ['frame', 'text', 'image'], dataKeys: ['hide'], component: true },
  // Repeat the node per item of an array prop (`$each`). Its on/off transitions
  // run through store.setEach (prop bookkeeping), not plain data writes.
  { key: 'repeat', title: 'Repeat', icon: 'repeat', kinds: ['frame', 'text', 'image'], dataKeys: ['$each'], notRoot: true, component: true },
  { key: 'position', title: 'Position', icon: 'position', kinds: ['frame', 'text', 'image'], dataKeys: ['$abs'], notRoot: true, component: true },
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

/**
 * The properties a node could have (before filtering already-added ones). A
 * built-in element (`kind` set) gets its kind-specific set; a placed component /
 * composed block (`kind` null, `isComponent`) gets only the placement props
 * (margin + position) that its wrapping `.mxel` div can carry.
 */
export function availableProps(kind: ElementKind | null, isRoot: boolean, isComponent = false): OptionalProp[] {
  if (isComponent) return OPTIONAL_PROPS.filter((p) => p.component && !(isRoot && p.notRoot))
  if (!kind) return []
  return OPTIONAL_PROPS.filter((p) => p.kinds.includes(kind) && !(isRoot && p.notRoot))
}
