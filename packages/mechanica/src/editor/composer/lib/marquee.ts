/**
 * Pure geometry for rubber-band (marquee) selection on the canvas. Points are
 * screen/viewport pixels (from `getBoundingClientRect`), so this works at any
 * zoom/pan without conversion. DOM wiring lives in `ComposerCanvas.vue`.
 */
import type { Box } from './canvas-overlay'

/** Normalize two drag points into a positive Box (handles dragging up/left). */
export function marqueeRect(x0: number, y0: number, x1: number, y1: number): Box {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

/** Axis-aligned overlap test; edges merely touching don't count as intersecting. */
export function rectsIntersect(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  )
}
