import { describe, it, expect } from 'vitest'
import {
  clamp01,
  clampRectPosition,
  cropTarget,
  defaultCropRect,
  derivativeName,
  hashString,
  normalizedAspect,
  resizeRect,
  resolveCropConfig,
} from '@/editor/lib/image-crop'

describe('resolveCropConfig', () => {
  it('returns null when the field does not opt into cropping', () => {
    expect(resolveCropConfig(undefined)).toBeNull()
    expect(resolveCropConfig(false)).toBeNull()
    expect(resolveCropConfig(0)).toBeNull()
  })

  it('true enables a free crop frame (no aspect lock)', () => {
    expect(resolveCropConfig(true)).toEqual({})
  })

  it('width + height locks the aspect and records the target box', () => {
    expect(resolveCropConfig({ width: 1200, height: 600 })).toEqual({
      aspect: 2,
      targetWidth: 1200,
      targetHeight: 600,
    })
  })

  it('aspect alone locks the ratio without a size cap', () => {
    expect(resolveCropConfig({ aspect: 1.5 })).toEqual({ aspect: 1.5 })
  })

  it('ignores non-positive dimensions', () => {
    expect(resolveCropConfig({ width: 0, height: 100 })).toEqual({})
    expect(resolveCropConfig({ aspect: -2 })).toEqual({})
  })
})

describe('cropTarget', () => {
  it('is the box only when both dimensions are set', () => {
    expect(cropTarget({ aspect: 2, targetWidth: 1200, targetHeight: 600 })).toEqual({ width: 1200, height: 600 })
    expect(cropTarget({ aspect: 2 })).toEqual({})
    expect(cropTarget({})).toEqual({})
  })
})

describe('defaultCropRect', () => {
  it('is the whole frame for a free crop', () => {
    expect(defaultCropRect(undefined, 800, 600)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('a wide target on a square image is full-width, letterboxed vertically', () => {
    // aspect 2 on a 1000×1000 image → width 1, height 0.5, centered.
    expect(defaultCropRect(2, 1000, 1000)).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 })
  })

  it('a square target on a wide image is full-height, pillarboxed horizontally', () => {
    // aspect 1 on a 2000×1000 image → height 1, width 0.5, centered.
    expect(defaultCropRect(1, 2000, 1000)).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 })
  })
})

describe('normalizedAspect', () => {
  it('converts a pixel aspect into the 0..1-space width/height ratio', () => {
    // 16:9 pixel target on a 1:1 image → the crop box must be wider than tall.
    expect(normalizedAspect(16 / 9, 1000, 1000)).toBeCloseTo(16 / 9)
    // Same target on a 2:1 image → a normalized ratio half as wide.
    expect(normalizedAspect(16 / 9, 2000, 1000)).toBeCloseTo(8 / 9)
  })
})

describe('resizeRect', () => {
  it('free resize spans anchor → pointer per-axis', () => {
    const r = resizeRect({ x: 0, y: 0 }, { x: 0.6, y: 0.4 })
    expect(r).toEqual({ x: 0, y: 0, width: 0.6, height: 0.4 })
  })

  it('clamps the pointer into the frame', () => {
    const r = resizeRect({ x: 0, y: 0 }, { x: 1.5, y: 2 })
    expect(r).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('aspect-locked keeps the ratio while following the pointer', () => {
    // Anchor top-left, aspectN 2 (twice as wide as tall). Drag mostly rightward.
    const r = resizeRect({ x: 0, y: 0 }, { x: 0.8, y: 0.1 }, 2)
    expect(r.width / r.height).toBeCloseTo(2)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
    expect(r.width).toBeCloseTo(0.8)
    expect(r.height).toBeCloseTo(0.4)
  })

  it('aspect-locked shrinks to stay in-frame near an edge', () => {
    // Anchor bottom-right at (1,1); a locked ratio of 2 that would overflow gets
    // scaled down so the whole rect stays within 0..1.
    const r = resizeRect({ x: 1, y: 1 }, { x: 0, y: 0 }, 2)
    expect(r.width / r.height).toBeCloseTo(2)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.width).toBeLessThanOrEqual(1.0001)
    expect(r.y + r.height).toBeLessThanOrEqual(1.0001)
  })
})

describe('clampRectPosition', () => {
  it('shifts a rect back inside the frame, preserving its size', () => {
    expect(clampRectPosition({ x: 0.9, y: -0.2, width: 0.4, height: 0.3 })).toEqual({
      x: 0.6,
      y: 0,
      width: 0.4,
      height: 0.3,
    })
  })
})

describe('derivativeName + hashString', () => {
  const rect = { x: 0.1, y: 0.1, width: 0.5, height: 0.4 }

  it('is deterministic for the same source + rect + target', () => {
    const a = derivativeName('/@mechanica/assets/hero.png', rect, { width: 1200, height: 600 })
    const b = derivativeName('/@mechanica/assets/hero.png', rect, { width: 1200, height: 600 })
    expect(a).toBe(b)
    expect(a).toMatch(/^hero\.crop-[a-z0-9]+\.webp$/)
  })

  it('changes when the crop rect changes', () => {
    const a = derivativeName('/@mechanica/assets/hero.png', rect, {})
    const b = derivativeName('/@mechanica/assets/hero.png', { ...rect, x: 0.2 }, {})
    expect(a).not.toBe(b)
  })

  it('falls back to a generic base for non-asset sources', () => {
    expect(derivativeName('data:image/png;base64,AAAA', rect, {})).toMatch(/^image\.crop-[a-z0-9]+\.webp$/)
  })

  it('hashString is stable and base36', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).toMatch(/^[a-z0-9]+$/)
  })
})

describe('clamp01', () => {
  it('clamps to the unit range', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.3)).toBe(0.3)
  })
})
