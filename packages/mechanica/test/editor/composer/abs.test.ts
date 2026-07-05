import { describe, it, expect } from 'vitest'
import { anchorSigns, reanchorOffset, absAxisLabels, anchorPoint } from '@/editor/composer/lib/abs'
import { ANCHOR_H, ANCHOR_V } from '@/elements/style-vars'

const ALL_ANCHORS = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
]

describe('anchorSigns', () => {
  it('inverts the x axis for right-pinned anchors', () => {
    expect(anchorSigns('top-left')).toEqual({ sx: 1, sy: 1 })
    expect(anchorSigns('top-right')).toEqual({ sx: -1, sy: 1 })
    expect(anchorSigns('right')).toEqual({ sx: -1, sy: 1 })
  })
  it('inverts the y axis for bottom-pinned anchors', () => {
    expect(anchorSigns('bottom-left')).toEqual({ sx: 1, sy: -1 })
    expect(anchorSigns('bottom')).toEqual({ sx: 1, sy: -1 })
    expect(anchorSigns('bottom-right')).toEqual({ sx: -1, sy: -1 })
  })
  it('follows the pointer for left/top/centre anchors', () => {
    expect(anchorSigns('center')).toEqual({ sx: 1, sy: 1 })
    expect(anchorSigns('top')).toEqual({ sx: 1, sy: 1 })
    expect(anchorSigns('left')).toEqual({ sx: 1, sy: 1 })
  })
})

describe('reanchorOffset', () => {
  const rect = { L: 10, T: 20, w: 100, h: 50, W: 400, H: 300 }
  it('keeps the raw left/top for a top-left anchor', () => {
    expect(reanchorOffset(rect, 'top-left')).toEqual({ x: 10, y: 20 })
  })
  it('measures from the far edge for right/bottom anchors', () => {
    expect(reanchorOffset(rect, 'top-right')).toEqual({ x: 290, y: 20 }) // 400 - 10 - 100
    expect(reanchorOffset(rect, 'bottom-left')).toEqual({ x: 10, y: 230 }) // 300 - 20 - 50
    expect(reanchorOffset(rect, 'bottom-right')).toEqual({ x: 290, y: 230 })
  })
  it('measures the element centre from the parent centre on a centred axis', () => {
    expect(reanchorOffset(rect, 'center')).toEqual({ x: -140, y: -105 }) // (10+50-200), (20+25-150)
    expect(reanchorOffset(rect, 'top')).toEqual({ x: -140, y: 20 })
    expect(reanchorOffset(rect, 'left')).toEqual({ x: 10, y: -105 })
  })
  it('rounds to whole pixels', () => {
    expect(reanchorOffset({ L: 10.4, T: 20.6, w: 100, h: 50, W: 400, H: 300 }, 'top-left')).toEqual({ x: 10, y: 21 })
  })

  // The inverse of reanchorOffset: the visual left/top an anchor's offsets produce
  // (mirrors absStyle). Re-anchoring must leave the element visually in place.
  const visualL = (anchor: string, x: number, w: number, W: number) => {
    const h = ANCHOR_H[anchor]
    return h === 'right' ? W - x - w : h === 'center' ? W / 2 + x - w / 2 : x
  }
  const visualT = (anchor: string, y: number, h: number, H: number) => {
    const v = ANCHOR_V[anchor]
    return v === 'bottom' ? H - y - h : v === 'center' ? H / 2 + y - h / 2 : y
  }
  it('round-trips: every anchor reproduces the same visual position', () => {
    const r = { L: 37, T: 44, w: 120, h: 60, W: 500, H: 320 }
    for (const anchor of ALL_ANCHORS) {
      const { x, y } = reanchorOffset(r, anchor)
      expect(visualL(anchor, x, r.w, r.W)).toBeCloseTo(r.L, 0)
      expect(visualT(anchor, y, r.h, r.H)).toBeCloseTo(r.T, 0)
    }
  })
})

describe('anchorPoint', () => {
  it('maps each anchor to its 0..1 reference fractions', () => {
    expect(anchorPoint('top-left')).toEqual({ fx: 0, fy: 0 })
    expect(anchorPoint('center')).toEqual({ fx: 0.5, fy: 0.5 })
    expect(anchorPoint('bottom-right')).toEqual({ fx: 1, fy: 1 })
    expect(anchorPoint('top')).toEqual({ fx: 0.5, fy: 0 })
    expect(anchorPoint('right')).toEqual({ fx: 1, fy: 0.5 })
    expect(anchorPoint('bottom-left')).toEqual({ fx: 0, fy: 1 })
  })
})

describe('absAxisLabels', () => {
  it('names the pinned edge per axis', () => {
    expect(absAxisLabels('top-left')).toEqual({ x: 'Left', y: 'Top' })
    expect(absAxisLabels('top-right')).toEqual({ x: 'Right', y: 'Top' })
    expect(absAxisLabels('bottom-right')).toEqual({ x: 'Right', y: 'Bottom' })
    expect(absAxisLabels('bottom-left')).toEqual({ x: 'Left', y: 'Bottom' })
  })
  it('uses the axis letter on a centred axis', () => {
    expect(absAxisLabels('center')).toEqual({ x: 'X', y: 'Y' })
    expect(absAxisLabels('top')).toEqual({ x: 'X', y: 'Top' })
    expect(absAxisLabels('left')).toEqual({ x: 'Left', y: 'Y' })
  })
})
