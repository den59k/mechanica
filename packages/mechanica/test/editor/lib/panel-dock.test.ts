import { describe, it, expect } from 'vitest'
import {
  DOCK_ANCHORS,
  anchorPosition,
  nearestAnchor,
  isDockAnchor,
  type DockMetrics,
} from '@/editor/lib/panel-dock'

const M: DockMetrics = { size: 36, margin: 14, leftPanel: 300, rightPanel: 380, gap: 8 }
const VP = { width: 1000, height: 600 }

describe('panel-dock geometry', () => {
  it('offers exactly eight points (corners + side midpoints), no centre-centre', () => {
    expect(DOCK_ANCHORS).toHaveLength(8)
    expect(DOCK_ANCHORS).toContain('top-center')
    expect(DOCK_ANCHORS).toContain('bottom-center')
  })

  it('rests at the screen edge when collapsed', () => {
    expect(anchorPosition('top-left', true, VP, M)).toEqual({ x: 14, y: 14 })
    expect(anchorPosition('top-right', true, VP, M)).toEqual({ x: 1000 - 36 - 14, y: 14 })
    expect(anchorPosition('bottom-left', true, VP, M)).toEqual({ x: 14, y: 600 - 36 - 14 })
  })

  it('slides side anchors inward when open; the right clears the wider settings panel', () => {
    expect(anchorPosition('left-middle', false, VP, M).x).toBe(300 + 8)
    expect(anchorPosition('right-middle', false, VP, M).x).toBe(1000 - 380 - 8 - 36)
  })

  it('keeps centre anchors put whether open or closed', () => {
    const closed = anchorPosition('top-center', true, VP, M)
    const open = anchorPosition('top-center', false, VP, M)
    expect(closed.x).toBe((1000 - 36) / 2)
    expect(closed).toEqual(open)
  })

  it('snaps a point to its nearest anchor', () => {
    expect(nearestAnchor({ x: 8, y: 8 }, true, VP, M)).toBe('top-left')
    expect(nearestAnchor({ x: 500, y: 8 }, true, VP, M)).toBe('top-center')
    expect(nearestAnchor({ x: 992, y: 592 }, true, VP, M)).toBe('bottom-right')
    expect(nearestAnchor({ x: 500, y: 592 }, true, VP, M)).toBe('bottom-center')
  })

  it('guards stored values', () => {
    expect(isDockAnchor('left-middle')).toBe(true)
    expect(isDockAnchor('center')).toBe(false)
    expect(isDockAnchor(null)).toBe(false)
  })
})
