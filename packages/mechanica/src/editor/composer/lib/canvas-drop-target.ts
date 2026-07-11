import { findBlock, type DropPosition } from '../../lib/content-tree'
import { isContainerBlock } from './elements-meta'
import { templateNodeId } from './canvas'
import { computeInsertion, type Axis, type Rect } from './canvas-drop'
import type { ComposerStore } from './composer-store'

/** A rendered drop hint, in client (viewport) coordinates for a fixed overlay. */
export interface DropIndicator {
  kind: 'line' | 'box'
  x: number
  y: number
  w: number
  h: number
}

export interface DropResult {
  drop: DropPosition
  indicator: DropIndicator
}

const LINE_THICKNESS = 2
// The artboard element. The root frame fills it, so an in-bounds pointer normally
// hits the root directly; this is the outside-all-blocks fallback (→ top-level drop).
const CANVAS_SELECTOR = '.mech-composer__world'

const toRect = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}
const flexAxis = (el: Element): Axis => (getComputedStyle(el).flexDirection.startsWith('row') ? 'row' : 'column')

/**
 * Resolve where a pointer would drop a block on the canvas — the shared
 * hit-test core for both drag-to-insert (palette → canvas) and on-canvas move.
 * It walks the live DOM (`elementFromPoint` respects the world transform, so
 * every rect is already screen-space), finds the target container and the index
 * among its direct children, and returns a `DropPosition` plus a client-space
 * indicator (a line between children, or a box over an empty container).
 *
 * `excludeId` (a node being moved) is skipped when enumerating a container's
 * children so a drag never anchors to itself.
 */
export function resolveCanvasDrop(
  clientX: number,
  clientY: number,
  store: ComposerStore,
  excludeId?: string,
): DropResult | null {
  const canvas = document.querySelector(CANVAS_SELECTOR) as HTMLElement | null
  if (!canvas) return null

  const hit = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest(
    '[data-block-id]',
  ) as HTMLElement | null

  // Repeated ($each) ghost instances carry an `@<i>` id suffix — normalize every
  // DOM id back to its template node so drops resolve against the template.
  const domId = (el: Element): string => templateNodeId(el.getAttribute('data-block-id')!)

  let containerEl: HTMLElement
  let containerId: string | null
  if (hit) {
    const hitId = domId(hit)
    const node = findBlock(store.template, hitId)
    const isContainer = !!node && (isContainerBlock(node.blockId) || node.children != null)
    if (isContainer) {
      containerEl = hit
      containerId = hitId
    } else {
      const parent = hit.parentElement?.closest('[data-block-id]') as HTMLElement | null
      containerEl = parent ?? canvas
      containerId = parent ? domId(parent) : null
    }
  } else {
    const r = canvas.getBoundingClientRect()
    const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    if (!inside) return null
    containerEl = canvas
    containerId = null
  }

  const childEls = [...containerEl.querySelectorAll<HTMLElement>('[data-block-id]')].filter((el) => {
    if (excludeId && domId(el) === excludeId) return false
    const parent = el.parentElement?.closest('[data-block-id]') as HTMLElement | null
    return (parent ? domId(parent) : null) === containerId
  })
  const axis: Axis = containerId ? flexAxis(containerEl) : 'column'
  const ins = computeInsertion(childEls.map(toRect), axis, clientX, clientY)

  if (childEls.length === 0) {
    const drop: DropPosition = containerId
      ? { anchorId: containerId, position: 'inside' }
      : { anchorId: null, position: 'after' }
    const r = containerEl.getBoundingClientRect()
    return { drop, indicator: { kind: 'box', x: r.left, y: r.top, w: r.width, h: r.height } }
  }

  const drop: DropPosition =
    ins.index === 0
      ? { anchorId: domId(childEls[0]!), position: 'before' }
      : { anchorId: domId(childEls[ins.index - 1]!), position: 'after' }

  const line = ins.line!
  const indicator: DropIndicator = line.vertical
    ? { kind: 'line', x: line.x - LINE_THICKNESS / 2, y: line.y, w: LINE_THICKNESS, h: line.length }
    : { kind: 'line', x: line.x, y: line.y - LINE_THICKNESS / 2, w: line.length, h: LINE_THICKNESS }
  return { drop, indicator }
}
