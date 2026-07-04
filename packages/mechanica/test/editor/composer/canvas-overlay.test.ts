import { describe, it, expect } from 'vitest'
import { handlePoint, handleAxes, resizeSize, handleCursor, HANDLES } from '@/editor/composer/lib/canvas-overlay'

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
