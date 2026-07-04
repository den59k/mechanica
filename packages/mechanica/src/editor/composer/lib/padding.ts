/**
 * Padding math for the composer inspector. A frame's `padding` is stored in the
 * shortest CSS-style form — `number` (all sides), `[y, x]`, or `[t, r, b, l]` —
 * and `style-vars.ts`'s `padding()` renders every form. The inspector edits
 * per-side, so it parses to explicit sides and collapses back on write. Pure and
 * unit-tested.
 */

import { snapTo } from './canvas-overlay'

export interface Sides {
  t: number
  r: number
  b: number
  l: number
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

/** Parse a padding value (`number` | `[y,x]` | `[t,r,b,l]` | `[t,r,b]`) into explicit sides. */
export function parsePadding(value: unknown): Sides {
  if (Array.isArray(value)) {
    const n = value.map(num)
    if (n.length >= 4) return { t: n[0]!, r: n[1]!, b: n[2]!, l: n[3]! }
    if (n.length === 3) return { t: n[0]!, r: n[1]!, b: n[2]!, l: n[1]! }
    if (n.length === 2) return { t: n[0]!, r: n[1]!, b: n[0]!, l: n[1]! }
    if (n.length === 1) return { t: n[0]!, r: n[0]!, b: n[0]!, l: n[0]! }
    return { t: 0, r: 0, b: 0, l: 0 }
  }
  const n = num(value)
  return { t: n, r: n, b: n, l: n }
}

/** Collapse explicit sides to the shortest form: `number` → `[y,x]` → `[t,r,b,l]`. */
export function collapsePadding(s: Sides): number | number[] {
  if (s.t === s.r && s.r === s.b && s.b === s.l) return s.t
  if (s.t === s.b && s.l === s.r) return [s.t, s.r]
  return [s.t, s.r, s.b, s.l]
}

/** Set one side, returning the collapsed value ready to store. */
export function setSide(value: unknown, side: keyof Sides, next: number): number | number[] {
  return collapsePadding({ ...parsePadding(value), [side]: next })
}

/**
 * New per-side padding from a drag gesture. Adds the signed `delta` to the
 * dragged `side` — or to every side when `allAxes` (Alt: edit both axes at once)
 * — snapping each result to `snap` when set (Shift: snap to a grid), rounding to
 * whole px otherwise, and clamping to ≥ 0. Pure.
 */
export function computePaddingDrag(
  start: Sides,
  side: keyof Sides,
  delta: number,
  opts: { allAxes?: boolean; snap?: number } = {},
): Sides {
  const { allAxes = false, snap = 0 } = opts
  const next = (base: number) => {
    const v = base + delta
    return Math.max(0, snap ? snapTo(v, snap) : Math.round(v))
  }
  if (allAxes) return { t: next(start.t), r: next(start.r), b: next(start.b), l: next(start.l) }
  return { ...start, [side]: next(start[side]) }
}
