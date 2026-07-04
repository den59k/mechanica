import { describe, it, expect } from 'vitest'
import { scrubValue } from '@/editor/composer/lib/scrub'

describe('scrubValue', () => {
  it('adds one unit per pixel dragged', () => {
    expect(scrubValue(100, 20, false)).toBe(120)
    expect(scrubValue(100, -35, false)).toBe(65)
  })
  it('scrubs in steps of 10 when coarse (Shift)', () => {
    expect(scrubValue(100, 5, true)).toBe(150)
    expect(scrubValue(100, -3, true)).toBe(70)
  })
  it('rounds fractional pixel deltas', () => {
    expect(scrubValue(0, 2.6, false)).toBe(3)
  })
  it('clamps to a minimum when given', () => {
    expect(scrubValue(4, -50, false, 0)).toBe(0)
    expect(scrubValue(4, -50, false)).toBe(-46) // no clamp
  })
})
