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
