import { describe, it, expect } from 'vitest'
import { computeInsertion, type Rect } from '@/editor/composer/lib/canvas-drop'

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom })

describe('computeInsertion', () => {
  it('reports index 0 with no line for an empty container', () => {
    expect(computeInsertion([], 'column', 50, 50)).toEqual({ index: 0, line: null })
  })

  describe('column (vertical stack → horizontal line)', () => {
    // Two stacked boxes: 0..40 and 40..80 tall, both 0..200 wide.
    const children = [rect(0, 0, 200, 40), rect(0, 40, 200, 80)]

    it('inserts before the first child when above its midpoint', () => {
      const { index, line } = computeInsertion(children, 'column', 100, 5)
      expect(index).toBe(0)
      expect(line).toMatchObject({ vertical: false, y: 0 })
    })

    it('inserts between children at the boundary', () => {
      const { index, line } = computeInsertion(children, 'column', 100, 35)
      expect(index).toBe(1)
      expect(line!.y).toBe(40) // trailing edge of child 0 == leading edge of child 1
      expect(line!.vertical).toBe(false)
    })

    it('appends after the last child when below its midpoint', () => {
      const { index, line } = computeInsertion(children, 'column', 100, 75)
      expect(index).toBe(2)
      expect(line!.y).toBe(80)
    })

    it('spans the cross-axis extent of the neighbours', () => {
      const { line } = computeInsertion(children, 'column', 100, 35)
      expect(line!.x).toBe(0)
      expect(line!.length).toBe(200)
    })
  })

  describe('row (horizontal stack → vertical line)', () => {
    const children = [rect(0, 0, 40, 100), rect(40, 0, 80, 100)]

    it('inserts between children with a vertical line', () => {
      const { index, line } = computeInsertion(children, 'row', 35, 50)
      expect(index).toBe(1)
      expect(line).toMatchObject({ vertical: true, x: 40, y: 0, length: 100 })
    })

    it('appends at the far edge', () => {
      const { index, line } = computeInsertion(children, 'row', 70, 50)
      expect(index).toBe(2)
      expect(line!.x).toBe(80)
    })
  })
})
