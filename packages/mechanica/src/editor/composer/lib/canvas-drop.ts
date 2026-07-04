/**
 * Pure geometry for drag-to-insert on the composer canvas. Given the screen
 * rects of a container's direct children and the pointer position, it decides
 * which index a dropped element lands at and where to draw the insertion line.
 * The DOM plumbing (hit-testing, reading flex direction) lives in
 * `use-insert-dnd.ts`; this part is deterministic and unit-tested.
 */

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** A container's main axis — a flex `row`/`row-reverse` reads as `row`. */
export type Axis = 'row' | 'column'

/** The insertion line to draw, in the same coordinate space as the input rects. */
export interface InsertionLine {
  x: number
  y: number
  /** Extent along the cross axis (the visible length of the line). */
  length: number
  /** A vertical line splits a row; a horizontal line splits a column. */
  vertical: boolean
}

export interface Insertion {
  /** Index in `[0, children.length]` the element inserts at. */
  index: number
  /** Null when the container has no children (the caller highlights it whole). */
  line: InsertionLine | null
}

const mainMid = (r: Rect, axis: Axis): number =>
  axis === 'row' ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2
const leadEdge = (r: Rect, axis: Axis): number => (axis === 'row' ? r.left : r.top)
const trailEdge = (r: Rect, axis: Axis): number => (axis === 'row' ? r.right : r.bottom)

/**
 * Where a dropped element lands among `children` laid out along `axis`, given
 * the pointer at `(x, y)`. The index is chosen by comparing the pointer's
 * main-axis position to each child's midpoint; the line sits at the boundary
 * between the two neighbours and spans their combined cross-axis extent.
 */
export function computeInsertion(children: Rect[], axis: Axis, x: number, y: number): Insertion {
  if (children.length === 0) return { index: 0, line: null }

  const main = axis === 'row' ? x : y
  let index = children.length
  for (let i = 0; i < children.length; i++) {
    if (mainMid(children[i]!, axis) >= main) {
      index = i
      break
    }
  }

  let edge: number
  if (index === 0) edge = leadEdge(children[0]!, axis)
  else if (index === children.length) edge = trailEdge(children[children.length - 1]!, axis)
  else edge = (trailEdge(children[index - 1]!, axis) + leadEdge(children[index]!, axis)) / 2

  // Cross-axis span from the neighbours flanking the boundary.
  const neighbours: Rect[] = []
  if (index - 1 >= 0) neighbours.push(children[index - 1]!)
  if (index < children.length) neighbours.push(children[index]!)
  const cross = (r: Rect, lead: boolean): number =>
    axis === 'row' ? (lead ? r.top : r.bottom) : lead ? r.left : r.right
  const crossMin = Math.min(...neighbours.map((r) => cross(r, true)))
  const crossMax = Math.max(...neighbours.map((r) => cross(r, false)))

  const line: InsertionLine =
    axis === 'row'
      ? { x: edge, y: crossMin, length: crossMax - crossMin, vertical: true }
      : { x: crossMin, y: edge, length: crossMax - crossMin, vertical: false }
  return { index, line }
}
