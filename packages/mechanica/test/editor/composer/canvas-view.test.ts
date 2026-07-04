import { describe, it, expect } from 'vitest'
import { clampZoom, zoomAround, fitView, MIN_ZOOM, MAX_ZOOM } from '@/editor/composer/lib/canvas-view'

describe('clampZoom', () => {
  it('clamps into the supported range', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(1)).toBe(1)
  })
})

describe('zoomAround', () => {
  it('keeps the world point under the cursor fixed', () => {
    const view = { zoom: 1, panX: 0, panY: 0 }
    // World point under a cursor at (300, 200).
    const before = { wx: (300 - view.panX) / view.zoom, wy: (200 - view.panY) / view.zoom }
    const next = zoomAround(view, 2, 300, 200)
    expect(next.zoom).toBe(2)
    // Same world point still maps to the same screen position.
    expect(next.panX + before.wx * next.zoom).toBeCloseTo(300)
    expect(next.panY + before.wy * next.zoom).toBeCloseTo(200)
  })

  it('respects the zoom clamp', () => {
    const next = zoomAround({ zoom: MAX_ZOOM, panX: 0, panY: 0 }, 4, 100, 100)
    expect(next.zoom).toBe(MAX_ZOOM)
  })
})

describe('fitView', () => {
  it('centers a sheet that fits without scaling past 1', () => {
    const v = fitView(1200, 800, 600, 400, 48)
    expect(v.zoom).toBe(1)
    expect(v.panX).toBe((1200 - 600) / 2)
  })

  it('scales down an oversized sheet to leave a gutter', () => {
    const v = fitView(800, 800, 1440, 900, 48)
    expect(v.zoom).toBeCloseTo((800 - 96) / 1440)
    expect(v.zoom).toBeLessThan(1)
  })

  it('biases a tall sheet toward the top', () => {
    const v = fitView(1200, 400, 600, 2000, 48)
    expect(v.panY).toBe(48)
  })
})
