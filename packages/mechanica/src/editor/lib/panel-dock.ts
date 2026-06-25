/**
 * Geometry for the floating panel toggle. The handle magnetizes to one of eight
 * points — the four corners and the middle of each side. It rests at the screen
 * edge when collapsed; when the panels are open, the left/right anchors slide
 * inward to clear their sidebar (the right side clears the wider settings panel),
 * while the two centre anchors stay put. Pure functions, unit-tested without a DOM.
 */

export type DockAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'right-middle'
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'left-middle'

/** All eight dock points (4 corners + 4 side midpoints), clockwise from top-left. */
export const DOCK_ANCHORS: DockAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'right-middle',
  'bottom-right',
  'bottom-center',
  'bottom-left',
  'left-middle',
]

export interface Box {
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}

export interface DockMetrics {
  /** Button size (square), px. */
  size: number
  /** Inset from the screen edges, px. */
  margin: number
  /** Left sidebar width the handle clears when open, px. */
  leftPanel: number
  /** Right sidebar width the handle clears when open (wider — the settings panel), px. */
  rightPanel: number
  /** Gap between a sidebar's inner edge and the handle when open, px. */
  gap: number
}

type Column = 'left' | 'center' | 'right'
type Row = 'top' | 'middle' | 'bottom'

const columnOf = (a: DockAnchor): Column =>
  a.includes('left') ? 'left' : a.includes('right') ? 'right' : 'center'
const rowOf = (a: DockAnchor): Row =>
  a.includes('top') ? 'top' : a.includes('bottom') ? 'bottom' : 'middle'

/** Top-left pixel position for the handle at `anchor`, given the collapsed state. */
export function anchorPosition(anchor: DockAnchor, collapsed: boolean, vp: Box, m: DockMetrics): Point {
  const col = columnOf(anchor)
  const r = rowOf(anchor)
  let x: number
  if (col === 'left') x = collapsed ? m.margin : m.leftPanel + m.gap
  else if (col === 'right') x = collapsed ? vp.width - m.size - m.margin : vp.width - m.rightPanel - m.gap - m.size
  else x = (vp.width - m.size) / 2
  const y = r === 'top' ? m.margin : r === 'bottom' ? vp.height - m.size - m.margin : (vp.height - m.size) / 2
  return { x, y }
}

/** Centre pixel of the handle at `anchor`. */
export function anchorCenter(anchor: DockAnchor, collapsed: boolean, vp: Box, m: DockMetrics): Point {
  const p = anchorPosition(anchor, collapsed, vp, m)
  return { x: p.x + m.size / 2, y: p.y + m.size / 2 }
}

/** The anchor whose centre is closest to `point` (itself a centre position). */
export function nearestAnchor(point: Point, collapsed: boolean, vp: Box, m: DockMetrics): DockAnchor {
  let best: DockAnchor = DOCK_ANCHORS[0]!
  let bestDist = Infinity
  for (const anchor of DOCK_ANCHORS) {
    const c = anchorCenter(anchor, collapsed, vp, m)
    const dist = (c.x - point.x) ** 2 + (c.y - point.y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = anchor
    }
  }
  return best
}

/** Narrowing guard for a value read back from storage. */
export function isDockAnchor(value: unknown): value is DockAnchor {
  return typeof value === 'string' && (DOCK_ANCHORS as string[]).includes(value)
}
