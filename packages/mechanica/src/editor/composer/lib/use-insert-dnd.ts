import { reactive } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { findBlock, type DropPosition } from '../../lib/content-tree'
import { isContainerBlock } from './elements-meta'
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

export interface InsertDnd {
  readonly dragging: boolean
  /** The label of the element being dragged, for the cursor ghost. */
  readonly label: string
  /** Current pointer position (client coords) while dragging, else null. */
  readonly pointer: { x: number; y: number } | null
  /** Where the element would land, or null when the pointer is off-canvas. */
  readonly indicator: DropIndicator | null
  /** Whether the click ending this drag should be swallowed (already inserted). */
  readonly suppressClick: boolean
  /** Arm an insert drag from a palette card's pointerdown; begins after a small move. */
  arm(make: () => ContentBlock, label: string, event: PointerEvent): void
}

const DRAG_THRESHOLD = 4
const LINE_THICKNESS = 2
const CANVAS_SELECTOR = '.mech-composer__canvas'

/**
 * Drag-to-insert for the composer: press a palette card, drag onto the canvas,
 * and drop an element at a precise spot with a live insertion indicator. A plain
 * click (no drag past the threshold) falls through to the card's own handler,
 * which appends at the current selection.
 *
 * Hit-testing runs against the live DOM (`elementFromPoint`) so it respects the
 * canvas pan/zoom transform automatically — every rect is already in screen
 * space. The index/line math is delegated to the pure {@link computeInsertion}.
 */
export function createInsertDnd(store: ComposerStore): InsertDnd {
  const state = reactive({
    dragging: false,
    label: '',
    pointer: null as { x: number; y: number } | null,
    indicator: null as DropIndicator | null,
    drop: null as DropPosition | null,
    suppressClick: false,
  })
  let candidate: { make: () => ContentBlock; label: string; x: number; y: number } | null = null

  const isContainerNode = (node: ContentBlock): boolean =>
    isContainerBlock(node.blockId) || node.children != null

  /** Direct child block elements of a container (excludes deeper descendants). */
  const directChildBlocks = (containerEl: Element, containerId: string | null): HTMLElement[] =>
    [...containerEl.querySelectorAll<HTMLElement>('[data-block-id]')].filter((el) => {
      const parent = el.parentElement?.closest('[data-block-id]') as HTMLElement | null
      return (parent?.getAttribute('data-block-id') ?? null) === containerId
    })

  const flexAxis = (el: Element): Axis =>
    getComputedStyle(el).flexDirection.startsWith('row') ? 'row' : 'column'

  const toRect = (el: Element): Rect => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }

  const clear = (): void => {
    state.drop = null
    state.indicator = null
  }

  const compute = (clientX: number, clientY: number): void => {
    const canvas = document.querySelector(CANVAS_SELECTOR) as HTMLElement | null
    if (!canvas) return clear()

    const hit = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest(
      '[data-block-id]',
    ) as HTMLElement | null

    // Resolve the container we're inserting into: the hit block if it's a
    // container, else the hit's parent container, else the canvas root.
    let containerEl: HTMLElement
    let containerId: string | null
    if (hit) {
      const hitId = hit.getAttribute('data-block-id')!
      const node = findBlock(store.template, hitId)
      if (node && isContainerNode(node)) {
        containerEl = hit
        containerId = hitId
      } else {
        const parent = hit.parentElement?.closest('[data-block-id]') as HTMLElement | null
        containerEl = parent ?? canvas
        containerId = parent?.getAttribute('data-block-id') ?? null
      }
    } else {
      const r = canvas.getBoundingClientRect()
      const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
      if (!inside) return clear()
      containerEl = canvas
      containerId = null
    }

    const childEls = directChildBlocks(containerEl, containerId)
    const axis: Axis = containerId ? flexAxis(containerEl) : 'column'
    const ins = computeInsertion(childEls.map(toRect), axis, clientX, clientY)

    if (childEls.length === 0) {
      // Empty container → drop inside (or append to the root) and outline it.
      state.drop = containerId
        ? { anchorId: containerId, position: 'inside' }
        : { anchorId: null, position: 'after' }
      const r = containerEl.getBoundingClientRect()
      state.indicator = { kind: 'box', x: r.left, y: r.top, w: r.width, h: r.height }
      return
    }

    state.drop =
      ins.index === 0
        ? { anchorId: childEls[0]!.getAttribute('data-block-id'), position: 'before' }
        : { anchorId: childEls[ins.index - 1]!.getAttribute('data-block-id'), position: 'after' }

    const line = ins.line!
    state.indicator = line.vertical
      ? { kind: 'line', x: line.x - LINE_THICKNESS / 2, y: line.y, w: LINE_THICKNESS, h: line.length }
      : { kind: 'line', x: line.x, y: line.y - LINE_THICKNESS / 2, w: line.length, h: LINE_THICKNESS }
  }

  const onMove = (event: PointerEvent): void => {
    if (!state.dragging && candidate) {
      const moved = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y)
      if (moved > DRAG_THRESHOLD) {
        state.dragging = true
        state.label = candidate.label
      }
    }
    if (state.dragging) {
      state.pointer = { x: event.clientX, y: event.clientY }
      compute(event.clientX, event.clientY)
    }
  }

  const onUp = (): void => {
    if (state.dragging) {
      if (candidate && state.drop) store.insertAt(candidate.make(), state.drop)
      // Swallow the click that follows so the card doesn't also append a copy.
      state.suppressClick = true
      setTimeout(() => (state.suppressClick = false), 0)
    }
    candidate = null
    state.dragging = false
    state.pointer = null
    clear()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  return {
    get dragging() {
      return state.dragging
    },
    get label() {
      return state.label
    },
    get pointer() {
      return state.pointer
    },
    get indicator() {
      return state.indicator
    },
    get suppressClick() {
      return state.suppressClick
    },
    arm(make, label, event) {
      candidate = { make, label, x: event.clientX, y: event.clientY }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
  }
}
