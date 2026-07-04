/**
 * Pure geometry for the composer's on-canvas manipulation overlay: resize-handle
 * layout and the resize math. Rects are measured with `getBoundingClientRect`
 * (already in screen space under the world transform), so the overlay works at
 * any zoom/pan by dividing screen deltas by `zoom` to reach world pixels. DOM
 * plumbing lives in `CanvasOverlay.vue`; this part is deterministic + tested.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** The 8 resize handles, clockwise from the top-left corner. */
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** The center point of a handle in the box's own coordinate space. */
export function handlePoint(box: Box, handle: Handle): { x: number; y: number } {
  const x = handle.includes('w') ? box.left : handle.includes('e') ? box.left + box.width : box.left + box.width / 2
  const y = handle.includes('n') ? box.top : handle.includes('s') ? box.top + box.height : box.top + box.height / 2
  return { x, y }
}

/** The direction each handle resizes along the x/y axes (-1, 0 or 1). */
export function handleAxes(handle: Handle): { sx: -1 | 0 | 1; sy: -1 | 0 | 1 } {
  return {
    sx: handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
    sy: handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0,
  }
}

/**
 * New width/height from a resize drag. `dx`/`dy` are screen-space pointer
 * deltas; they are divided by `zoom` to reach world pixels, rounded, and
 * clamped to `min`. Only the axes the handle drives are returned.
 */
export function resizeSize(
  start: { w: number; h: number },
  handle: Handle,
  dx: number,
  dy: number,
  zoom: number,
  min = 8,
): { w?: number; h?: number } {
  const { sx, sy } = handleAxes(handle)
  const out: { w?: number; h?: number } = {}
  if (sx !== 0) out.w = Math.max(min, Math.round(start.w + (dx / zoom) * sx))
  if (sy !== 0) out.h = Math.max(min, Math.round(start.h + (dy / zoom) * sy))
  return out
}

/**
 * Interactive strips centered in the gaps between consecutive flow children of a
 * frame — drag one to change the frame's `gap`. `axis` is the layout axis (`'x'`
 * for a row, `'y'` for a column); `hit` is the strip's thickness (screen px).
 * Each strip spans the cross-axis union of the two children it sits between.
 */
export function gapStrips(boxes: Box[], axis: 'x' | 'y', hit: number): Box[] {
  const strips: Box[] = []
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i]!
    const b = boxes[i + 1]!
    if (axis === 'x') {
      const mid = (a.left + a.width + b.left) / 2
      const top = Math.min(a.top, b.top)
      const bottom = Math.max(a.top + a.height, b.top + b.height)
      strips.push({ left: mid - hit / 2, top, width: hit, height: bottom - top })
    } else {
      const mid = (a.top + a.height + b.top) / 2
      const left = Math.min(a.left, b.left)
      const right = Math.max(a.left + a.width, b.left + b.width)
      strips.push({ left, top: mid - hit / 2, width: right - left, height: hit })
    }
  }
  return strips
}

/** A frame side, for padding strips. */
export type Side = 't' | 'r' | 'b' | 'l'

/**
 * The four padding regions of a frame — drag one to change that side's padding.
 * `outer` is the frame's screen box; `pad` is each side's rendered thickness
 * (already scaled to screen px). Each strip is at least `minHit` thick so a zero
 * padding is still grabbable; the left/right strips inset by the top/bottom
 * thickness so the corners belong to the top/bottom strips.
 */
export function paddingStrips(
  outer: Box,
  pad: { t: number; r: number; b: number; l: number },
  minHit: number,
): { side: Side; box: Box }[] {
  const t = Math.max(pad.t, minHit)
  const r = Math.max(pad.r, minHit)
  const b = Math.max(pad.b, minHit)
  const l = Math.max(pad.l, minHit)
  const { left, top, width, height } = outer
  const midH = Math.max(0, height - t - b)
  return [
    { side: 't', box: { left, top, width, height: t } },
    { side: 'b', box: { left, top: top + height - b, width, height: b } },
    { side: 'l', box: { left, top: top + t, width: l, height: midH } },
    { side: 'r', box: { left: left + width - r, top: top + t, width: r, height: midH } },
  ]
}

const CURSORS: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
}

/** The CSS cursor for a handle. */
export function handleCursor(handle: Handle): string {
  return CURSORS[handle]
}
