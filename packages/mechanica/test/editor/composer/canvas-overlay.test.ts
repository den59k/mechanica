import { describe, it, expect } from 'vitest'
import { handlePoint, handleAxes, resizeSize, handleCursor, HANDLES, gapStrips, paddingStrips } from '@/editor/composer/lib/canvas-overlay'

const box = { left: 100, top: 50, width: 200, height: 80 }

describe('handlePoint', () => {
  it('places corner and edge handles on the box', () => {
    expect(handlePoint(box, 'nw')).toEqual({ x: 100, y: 50 })
    expect(handlePoint(box, 'se')).toEqual({ x: 300, y: 130 })
    expect(handlePoint(box, 'n')).toEqual({ x: 200, y: 50 })
    expect(handlePoint(box, 'e')).toEqual({ x: 300, y: 90 })
  })
  it('exposes all eight handles', () => {
    expect(HANDLES).toHaveLength(8)
  })
})

describe('handleAxes', () => {
  it('maps handles to resize directions', () => {
    expect(handleAxes('e')).toEqual({ sx: 1, sy: 0 })
    expect(handleAxes('w')).toEqual({ sx: -1, sy: 0 })
    expect(handleAxes('n')).toEqual({ sx: 0, sy: -1 })
    expect(handleAxes('se')).toEqual({ sx: 1, sy: 1 })
    expect(handleAxes('nw')).toEqual({ sx: -1, sy: -1 })
  })
})

describe('resizeSize', () => {
  it('grows width dragging the east handle right', () => {
    expect(resizeSize({ w: 200, h: 80 }, 'e', 40, 0, 1)).toEqual({ w: 240 })
  })
  it('shrinks width dragging the west handle right (inward)', () => {
    expect(resizeSize({ w: 200, h: 80 }, 'w', 40, 0, 1)).toEqual({ w: 160 })
  })
  it('divides screen deltas by zoom to reach world pixels', () => {
    expect(resizeSize({ w: 200, h: 80 }, 'e', 40, 0, 2)).toEqual({ w: 220 })
  })
  it('drives both axes from a corner handle', () => {
    expect(resizeSize({ w: 200, h: 80 }, 'se', 40, 20, 1)).toEqual({ w: 240, h: 100 })
  })
  it('clamps to the minimum size', () => {
    expect(resizeSize({ w: 200, h: 80 }, 'w', 500, 0, 1)).toEqual({ w: 8 })
  })
  it('rounds to whole pixels', () => {
    expect(resizeSize({ w: 200, h: 80 }, 'e', 15, 0, 2)).toEqual({ w: 208 }) // 200 + 7.5 → 208
  })
})

describe('handleCursor', () => {
  it('returns the resize cursor per handle orientation', () => {
    expect(handleCursor('n')).toBe('ns-resize')
    expect(handleCursor('e')).toBe('ew-resize')
    expect(handleCursor('se')).toBe('nwse-resize')
    expect(handleCursor('ne')).toBe('nesw-resize')
  })
})

describe('gapStrips', () => {
  it('centers a vertical strip in a row gap, spanning the cross union', () => {
    // Two 100×40 boxes side by side with a 20px gap (right edge 200, next left 220).
    const a = { left: 100, top: 50, width: 100, height: 40 }
    const b = { left: 220, top: 60, width: 100, height: 30 }
    expect(gapStrips([a, b], 'x', 8)).toEqual([
      { left: 206, top: 50, width: 8, height: 40 }, // mid=(200+220)/2=210, hit 8 → 206..214
    ])
  })
  it('centers a horizontal strip in a column gap', () => {
    const a = { left: 50, top: 0, width: 80, height: 40 } // bottom 40
    const b = { left: 60, top: 60, width: 100, height: 40 } // top 60 → mid 50
    expect(gapStrips([a, b], 'y', 6)).toEqual([
      { left: 50, top: 47, width: 110, height: 6 }, // union left 50..160
    ])
  })
  it('produces N-1 strips and none for a single child', () => {
    const boxes = [
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 20, top: 0, width: 10, height: 10 },
      { left: 40, top: 0, width: 10, height: 10 },
    ]
    expect(gapStrips(boxes, 'x', 8)).toHaveLength(2)
    expect(gapStrips([boxes[0]!], 'x', 8)).toEqual([])
  })
})

describe('paddingStrips', () => {
  const outer = { left: 0, top: 0, width: 200, height: 100 }
  it('lays out four side regions, insetting sides by top/bottom thickness', () => {
    const strips = paddingStrips(outer, { t: 20, r: 10, b: 0, l: 0 }, 6)
    const by = Object.fromEntries(strips.map((s) => [s.side, s.box]))
    expect(by.t).toEqual({ left: 0, top: 0, width: 200, height: 20 })
    expect(by.b).toEqual({ left: 0, top: 94, width: 200, height: 6 }) // b=0 → minHit 6
    expect(by.l).toEqual({ left: 0, top: 20, width: 6, height: 74 }) // inset by t(20)+b(6)
    expect(by.r).toEqual({ left: 190, top: 20, width: 10, height: 74 })
  })
  it('keeps a minimum grab thickness even at zero padding', () => {
    const strips = paddingStrips(outer, { t: 0, r: 0, b: 0, l: 0 }, 8)
    expect(strips.every((s) => s.box.width >= 8 && s.box.height >= 0)).toBe(true)
  })
})
