/**
 * Pure math for the composer's pan/zoom viewport. The canvas lives in a "world"
 * transformed as `translate(panX, panY) scale(zoom)` (origin `0 0`), so a point
 * `w` in world space lands at `pan + w * zoom` on screen. These helpers keep the
 * point under the cursor fixed while zooming — the Figma feel — with no DOM.
 */

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

/** Clamp a zoom factor into the supported range. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

// Wheel-zoom tuning: a mouse notch reports ~±100px deltaY, so without taming it
// a single notch would leap ~2.7×. We clamp the per-event delta and apply a
// gentle exponent, which keeps a notch near the ±20% button step while leaving
// a touchpad pinch (many tiny deltas) smooth.
const WHEEL_CLAMP = 40
const WHEEL_ZOOM_SPEED = 0.0045

/**
 * The zoom factor for one wheel event. A negative `deltaY` (scroll up / pinch
 * out) zooms in (factor > 1); positive zooms out. Line-mode deltas (Firefox)
 * are normalized to roughly pixels first, then clamped so large mouse notches
 * step gently instead of leaping.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  let delta = deltaMode === 1 ? deltaY * 16 : deltaY
  delta = Math.max(-WHEEL_CLAMP, Math.min(WHEEL_CLAMP, delta))
  return Math.exp(-delta * WHEEL_ZOOM_SPEED)
}

export interface View {
  zoom: number
  panX: number
  panY: number
}

/**
 * Zoom by `factor` while keeping the world point under `(cx, cy)` — cursor
 * coordinates relative to the viewport's top-left — pinned in place. Returns the
 * next view; the zoom is clamped, so at the range ends the pan barely moves.
 */
export function zoomAround(view: View, factor: number, cx: number, cy: number): View {
  const zoom = clampZoom(view.zoom * factor)
  // The world point currently under the cursor.
  const wx = (cx - view.panX) / view.zoom
  const wy = (cy - view.panY) / view.zoom
  // Re-pan so that same world point stays under the cursor at the new zoom.
  return { zoom, panX: cx - wx * zoom, panY: cy - wy * zoom }
}

/**
 * A view that centers a `contentWidth`×`contentHeight` sheet inside a
 * `viewportWidth`×`viewportHeight` viewport, scaled down (never up past 1) to
 * leave a `margin` gutter when the sheet is larger than the viewport.
 */
export function fitView(
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
  margin = 48,
): View {
  const available = Math.max(0, viewportWidth - margin * 2)
  const zoom = clampZoom(contentWidth > available ? available / contentWidth : 1)
  const panX = (viewportWidth - contentWidth * zoom) / 2
  // Bias toward the top: a tall sheet starts at the top gutter rather than
  // centered (you scroll down to see the rest).
  const scaledHeight = contentHeight * zoom
  const panY = scaledHeight + margin * 2 > viewportHeight ? margin : (viewportHeight - scaledHeight) / 2
  return { zoom, panX, panY }
}
