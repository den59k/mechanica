import type { ComposedBlockDefinition, ContentBlock, PropBinding } from './types'

/**
 * Expansion of composed blocks into a concrete content tree. DOM- and
 * framework-free so the render side (client, SSR, export) shares one
 * implementation. See PLAN.md § 2.3 / § 4.4.
 */

/** Reserved data keys the composer engine consumes (never passed as props). */
const IF_KEY = '$if'
const EACH_KEY = '$each'

/** Whether a value is a prop binding (`{ $bind: 'name' }`). */
export function isBinding(value: unknown): value is PropBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { $bind?: unknown }).$bind === 'string'
  )
}

/**
 * Look up a binding name in a prop scope. Supports dot paths (`$item.title`,
 * `cta.url`) so a repeated subtree can bind fields of the current `$item` and a
 * binding can reach into an object prop without exposing each leaf separately.
 */
export function lookupBinding(name: string, props: Record<string, unknown>): unknown {
  if (name in props) return props[name]
  if (!name.includes('.')) return undefined
  let value: unknown = props
  for (const part of name.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

/**
 * Deep-resolve a data value: substitute every `{ $bind: name }` with the named
 * prop, recursing through arrays and plain objects (so a bound value nested in
 * e.g. a `smartLink` object resolves too). Non-binding scalars pass through;
 * everything is cloned, so the returned value never aliases the template.
 */
export function resolveBindings(value: unknown, props: Record<string, unknown>): unknown {
  if (isBinding(value)) return lookupBinding(value.$bind, props)
  if (Array.isArray(value)) return value.map((item) => resolveBindings(item, props))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = resolveBindings(item, props)
    return out
  }
  return value
}

/** Resolve one template node, or `null` when a falsy `$if` binding drops it. */
function resolveNode(
  node: ContentBlock,
  props: Record<string, unknown>,
  prefix: string,
  index: number,
  idSuffix = '',
): ContentBlock | null {
  const raw = node.data ?? {}
  // `$if` gates the node's presence — resolve it before anything else so a
  // hidden element costs nothing downstream.
  if (IF_KEY in raw && !resolveBindings(raw[IF_KEY], props)) return null

  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === IF_KEY || key === EACH_KEY) continue
    data[key] = resolveBindings(value, props)
  }

  // Namespace ids under the placed instance so two placements of the same
  // composed block produce distinct, stable vnode keys.
  const id = `${prefix}:${node.id ?? index}${idSuffix}`
  const resolved: ContentBlock = { id, blockId: node.blockId, data }
  if (node.v != null) resolved.v = node.v
  if (node.children) resolved.children = resolveChildren(node.children, props, id)
  return resolved
}

function resolveList(list: ContentBlock[], props: Record<string, unknown>, prefix: string): ContentBlock[] {
  const out: ContentBlock[] = []
  list.forEach((child, index) => {
    const each = child.data?.[EACH_KEY]
    if (typeof each === 'string') {
      // `$each: 'items'` repeats this node (and its subtree) once per array
      // item. Inside the subtree, `$bind: '$item'` / `'$item.field'` resolve
      // from the current item and `$bind: '$index'` from its position; other
      // names still resolve from the block's props. A missing/non-array prop
      // renders nothing — an empty list is empty, not broken.
      const items = lookupBinding(each, props)
      if (!Array.isArray(items)) return
      items.forEach((item, i) => {
        const scope = { ...props, $item: item, $index: i }
        const resolved = resolveNode(child, scope, prefix, index, `@${i}`)
        if (resolved) out.push(resolved)
      })
      return
    }
    const resolved = resolveNode(child, props, prefix, index)
    if (resolved) out.push(resolved)
  })
  return out
}

function resolveChildren(
  children: NonNullable<ContentBlock['children']>,
  props: Record<string, unknown>,
  prefix: string,
): ContentBlock['children'] {
  if (Array.isArray(children)) return resolveList(children, props, `${prefix}/d`)
  const map: Record<string, ContentBlock[]> = {}
  for (const [name, list] of Object.entries(children)) {
    map[name] = resolveList(list, props, `${prefix}/${name}`)
  }
  return map
}

/**
 * Expand a composed block's template into a concrete content tree: substitute
 * `$bind` values from `props`, repeat `$each` nodes per array item, drop
 * `$if`-hidden nodes, and namespace every node id under `instanceId` (the
 * placed block's id — stable across renders). The result is rendered by the
 * normal block-render pipeline.
 */
export function resolveComposedTemplate(
  def: ComposedBlockDefinition,
  props: Record<string, unknown> | undefined,
  instanceId: string,
): ContentBlock[] {
  return resolveList(def.template ?? [], props ?? {}, instanceId)
}

/**
 * Block ids referenced anywhere in a composed template (recursing into slot
 * children). Used to expand a page's used-block set so the underlying compiled
 * blocks' chunks load before a composed block mounts. Element blocks (`mech:*`)
 * ship with the runtime; they need no loader but are harmless to include.
 */
export function templateBlockIds(def: ComposedBlockDefinition): Set<string> {
  const ids = new Set<string>()
  const walk = (list: ContentBlock[]): void => {
    for (const node of list) {
      ids.add(node.blockId)
      if (!node.children) continue
      if (Array.isArray(node.children)) walk(node.children)
      else for (const inner of Object.values(node.children)) walk(inner)
    }
  }
  walk(def.template ?? [])
  return ids
}
