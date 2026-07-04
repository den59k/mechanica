import { resolveBindings, type ContentBlock } from 'mechanica-shared'

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
 * `$bp`/`$if` control keys are dropped. This is how the canvas previews a
 * breakpoint without relying on viewport media queries — the values are
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
  return data
}

/**
 * Prepare a template for display on the composer canvas: merge each node's
 * breakpoint overrides for `breakpoint`, resolve `$bind` values against `props`
 * (so bound fields show real content, not `[object Object]`), and keep the
 * original node ids as `data-block-id` so a canvas click maps straight back to
 * the template node. Unlike the runtime, `$if`-hidden nodes are kept — the
 * designer must be able to select and edit them.
 */
export function resolveForCanvas(
  nodes: ContentBlock[],
  breakpoint: CanvasBreakpoint,
  props: Record<string, unknown>,
): ContentBlock[] {
  return nodes.map((node) => {
    const merged = effectiveData(node, breakpoint)
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(merged)) data[key] = resolveBindings(value, props)
    const out: ContentBlock = { id: node.id, blockId: node.blockId, data }
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
  })
}
