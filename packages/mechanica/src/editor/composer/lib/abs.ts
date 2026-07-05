/**
 * Absolute-placement (`$abs`) helpers for the composer, keyed off the shared
 * anchor decomposition (`ANCHOR_H` / `ANCHOR_V`). Pure and unit-tested; the DOM
 * measurement that feeds `reanchorOffset` lives in the inspector.
 *
 * An anchor pins the element to an edge (or centre) on each axis: `x`/`y` are the
 * offsets from that edge. A right- or bottom-pinned offset maps to CSS `right:` /
 * `bottom:`, which *grows toward* that edge — so those axes read inverted for both
 * dragging and labelling.
 */

import { ANCHOR_H, ANCHOR_V } from '../../../elements/style-vars'

const hOf = (anchor: string) => ANCHOR_H[anchor] ?? 'left'
const vOf = (anchor: string) => ANCHOR_V[anchor] ?? 'top'

/**
 * Sign for a pointer-drag delta on each axis. Left/top/centre offsets follow the
 * pointer (+1); a right- or bottom-pinned offset grows as the pointer moves the
 * *other* way, so it inverts (-1).
 */
export function anchorSigns(anchor: string): { sx: number; sy: number } {
  return { sx: hOf(anchor) === 'right' ? -1 : 1, sy: vOf(anchor) === 'bottom' ? -1 : 1 }
}

/** The element rect relative to its containing block (parent frame), world px. */
export interface AbsRect {
  /** Left / top of the element's border box within the parent. */
  L: number
  T: number
  /** Element border-box size. */
  w: number
  h: number
  /** Parent (containing block) size. */
  W: number
  H: number
}

/**
 * Re-express an element's current position as the `x`/`y` offsets for a new
 * anchor, so switching anchor leaves it visually in place. `left` offsets = the
 * gap to the left edge, `right` = gap to the right edge, a centred axis = the
 * element centre's distance from the parent centre.
 */
export function reanchorOffset(r: AbsRect, anchor: string): { x: number; y: number } {
  const h = hOf(anchor)
  const v = vOf(anchor)
  const x = h === 'right' ? r.W - r.L - r.w : h === 'center' ? r.L + r.w / 2 - r.W / 2 : r.L
  const y = v === 'bottom' ? r.H - r.T - r.h : v === 'center' ? r.T + r.h / 2 - r.H / 2 : r.T
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * The offset-field labels for an anchor — the edge each offset is measured from
 * ("Left" / "Right" / "Top" / "Bottom"), or the axis letter on a centred axis.
 */
export function absAxisLabels(anchor: string): { x: string; y: string } {
  const h = hOf(anchor)
  const v = vOf(anchor)
  return {
    x: h === 'right' ? 'Right' : h === 'center' ? 'X' : 'Left',
    y: v === 'bottom' ? 'Bottom' : v === 'center' ? 'Y' : 'Top',
  }
}
