import { describe, it, expect } from 'vitest'
import { reorderTarget } from '@/editor/props-panel/use-reorder'

// Three stacked rows, each 10px tall → midpoints at 5, 15, 25.
const rects = [
  { top: 0, height: 10 },
  { top: 10, height: 10 },
  { top: 20, height: 10 },
]

describe('reorderTarget', () => {
  it('moves down past a row once the pointer crosses its midpoint', () => {
    expect(reorderTarget(rects, 0, 16)).toBe(1) // past row 1's mid (15)
    expect(reorderTarget(rects, 0, 26)).toBe(2) // past row 2's mid (25)
    expect(reorderTarget(rects, 0, 14)).toBe(0) // not yet past row 1's mid
  })

  it('moves up to the first row whose midpoint the pointer is above', () => {
    expect(reorderTarget(rects, 2, 4)).toBe(0) // above row 0's mid (5)
    expect(reorderTarget(rects, 2, 14)).toBe(1) // above row 1's mid (15)
  })

  it('stays put when the pointer is over its own row', () => {
    expect(reorderTarget(rects, 1, 15)).toBe(1)
  })
})
