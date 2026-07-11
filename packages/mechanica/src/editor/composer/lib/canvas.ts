import { lookupBinding, resolveBindings, type ContentBlock } from 'mechanica-shared'

/**
 * Breakpoints the composer canvas can preview. `base` = the desktop values;
 * `md`/`sm` cascade the node's `$bp` overrides over the base.
 */
export type CanvasBreakpoint = 'base' | 'md' | 'sm'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The effective data of a node at a breakpoint: base values with the `$bp.md`
 * then `$bp.sm` overrides merged over them (a narrower breakpoint wins). The
 * `$bp`/`$if`/`$each` control keys are dropped. This is how the canvas previews
 * a breakpoint without relying on viewport media queries — the values are
 * pre-merged, so a narrow canvas frame inside a wide viewport still shows the
 * mobile layout. (On a real page/export the media queries do the same job.)
 */
export function effectiveData(
  node: ContentBlock,
  breakpoint: CanvasBreakpoint,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(node.data ?? {}) }
  const bp = data.$bp
  if (isObject(bp)) {
    if (breakpoint === 'md' || breakpoint === 'sm') Object.assign(data, isObject(bp.md) ? bp.md : {})
    if (breakpoint === 'sm') Object.assign(data, isObject(bp.sm) ? bp.sm : {})
  }
  delete data.$bp
  delete data.$if
  delete data.$each
  return data
}

/**
 * The template node id behind a canvas `data-block-id`. Repeated (`$each`)
 * instances after the first render with an `@<index>` suffix so their vnode
 * keys stay unique; a canvas hit on any instance maps back to the one template
 * node. (`uid()` ids are UUIDs / base36 — they never contain `@`.)
 */
export function templateNodeId(canvasId: string): string {
  const at = canvasId.lastIndexOf('@')
  return at > 0 && /^\d+$/.test(canvasId.slice(at + 1)) ? canvasId.slice(0, at) : canvasId
}

/**
 * Prepare a template for display on the composer canvas: merge each node's
 * breakpoint overrides for `breakpoint`, resolve `$bind` values against `props`
 * (so bound fields show real content, not `[object Object]`), and keep the
 * original node ids as `data-block-id` so a canvas click maps straight back to
 * the template node. Unlike the runtime, `$if`-hidden nodes are kept — the
 * designer must be able to select and edit them.
 *
 * A `$each` node expands per preview item: the first instance keeps the
 * template node's id (selection/overlay target it), later ones ride an `@<i>`
 * suffix (see {@link templateNodeId}). No/empty preview items still render one
 * instance — the designer must always be able to see and edit the repeated
 * subtree.
 */
export function resolveForCanvas(
  nodes: ContentBlock[],
  breakpoint: CanvasBreakpoint,
  props: Record<string, unknown>,
): ContentBlock[] {
  const out: ContentBlock[] = []
  for (const node of nodes) {
    const each = node.data?.$each
    if (typeof each === 'string') {
      const items = lookupBinding(each, props)
      const list = Array.isArray(items) && items.length ? items : [undefined]
      list.forEach((item, i) => {
        const scope = { ...props, $item: item, $index: i }
        out.push(resolveNode(node, breakpoint, scope, i === 0 ? node.id : `${node.id}@${i}`))
      })
      continue
    }
    out.push(resolveNode(node, breakpoint, props, node.id))
  }
  return out
}

function resolveNode(
  node: ContentBlock,
  breakpoint: CanvasBreakpoint,
  props: Record<string, unknown>,
  id: string,
): ContentBlock {
  const merged = effectiveData(node, breakpoint)
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(merged)) data[key] = resolveBindings(value, props)
  const out: ContentBlock = { id, blockId: node.blockId, data }
  if (node.children) {
    out.children = Array.isArray(node.children)
      ? resolveForCanvas(node.children, breakpoint, props)
      : Object.fromEntries(
          Object.entries(node.children).map(([slot, list]) => [
            slot,
            resolveForCanvas(list, breakpoint, props),
          ]),
        )
  }
  return out
}
