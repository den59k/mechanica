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

const OPPOSITE: Record<keyof Sides, keyof Sides> = { t: 'b', b: 't', l: 'r', r: 'l' }

/**
 * New per-side padding from a drag gesture. Adds the signed `delta` to the
 * dragged `side` (snapping to `snap` when set — Shift — else rounding, clamped
 * ≥ 0). When `symmetric` (Alt), the opposite side is set to that same value, so
 * the axis stays symmetric. Pure.
 */
export function computePaddingDrag(
  start: Sides,
  side: keyof Sides,
  delta: number,
  opts: { symmetric?: boolean; snap?: number } = {},
): Sides {
  const { symmetric = false, snap = 0 } = opts
  const raw = start[side] + delta
  const value = Math.max(0, snap ? snapTo(raw, snap) : Math.round(raw))
  const result: Sides = { ...start, [side]: value }
  if (symmetric) result[OPPOSITE[side]] = value
  return result
}
