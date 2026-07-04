import { reactive } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { resolveCanvasDrop, type DropIndicator } from './canvas-drop-target'
import type { ComposerStore } from './composer-store'

export type { DropIndicator } from './canvas-drop-target'

export interface InsertDnd {
  readonly dragging: boolean
  /** The label shown in the cursor ghost while dragging. */
  readonly label: string
  /** Current pointer position (client coords) while dragging, else null. */
  readonly pointer: { x: number; y: number } | null
  /** Where the block would land, or null when the pointer is off-canvas. */
  readonly indicator: DropIndicator | null
  /** Whether the click ending this drag should be swallowed (already handled). */
  readonly suppressClick: boolean
  /** Arm a drag that inserts a *new* node (palette → canvas). */
  arm(make: () => ContentBlock, label: string, event: PointerEvent): void
  /** Arm a drag that *relocates* an existing node (on-canvas move). */
  armMove(nodeId: string, label: string, event: PointerEvent): void
}

const DRAG_THRESHOLD = 4

/**
 * Drag-to-place for the composer canvas — unified for palette inserts and
 * on-canvas moves. A palette card `arm`s an insert (build a fresh node and drop
 * it); a selected element `armMove`s a relocate (move an existing node). Both
 * share the live-DOM hit-test ({@link resolveCanvasDrop}) and the same drop
 * indicator + cursor ghost, so the two interactions never diverge.
 *
 * A plain click (no drag past the threshold) falls through to the caller's own
 * handler; a real drag swallows the trailing click.
 */
export function createInsertDnd(store: ComposerStore): InsertDnd {
  const state = reactive({
    dragging: false,
    label: '',
    pointer: null as { x: number; y: number } | null,
    indicator: null as DropIndicator | null,
    drop: null as import('./canvas-drop-target').DropResult['drop'] | null,
    suppressClick: false,
  })

  // One of these is set while a drag is armed.
  let candidate:
    | { kind: 'insert'; make: () => ContentBlock; label: string; x: number; y: number }
    | { kind: 'move'; nodeId: string; label: string; x: number; y: number }
    | null = null
  // The moving element, made click-through so hit-testing sees past it.
  let movingEl: HTMLElement | null = null

  const compute = (clientX: number, clientY: number): void => {
    const excludeId = candidate?.kind === 'move' ? candidate.nodeId : undefined
    const result = resolveCanvasDrop(clientX, clientY, store, excludeId)
    state.drop = result?.drop ?? null
    state.indicator = result?.indicator ?? null
  }

  const beginDrag = (): void => {
    state.dragging = true
    state.label = candidate!.label
    if (candidate!.kind === 'move') {
      movingEl = document.querySelector(`[data-block-id="${candidate!.nodeId}"]`)
      if (movingEl) movingEl.style.pointerEvents = 'none'
    }
  }

  const onMove = (event: PointerEvent): void => {
    if (!state.dragging && candidate) {
      const moved = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y)
      if (moved > DRAG_THRESHOLD) beginDrag()
    }
    if (state.dragging) {
      state.pointer = { x: event.clientX, y: event.clientY }
      compute(event.clientX, event.clientY)
    }
  }

  const onUp = (): void => {
    if (state.dragging && candidate && state.drop) {
      if (candidate.kind === 'insert') store.insertAt(candidate.make(), state.drop)
      else store.relocate(candidate.nodeId, state.drop)
    }
    if (state.dragging) {
      state.suppressClick = true
      setTimeout(() => (state.suppressClick = false), 0)
    }
    if (movingEl) movingEl.style.pointerEvents = ''
    movingEl = null
    candidate = null
    state.dragging = false
    state.pointer = null
    state.indicator = null
    state.drop = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  const listen = (): void => {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
      candidate = { kind: 'insert', make, label, x: event.clientX, y: event.clientY }
      listen()
    },
    armMove(nodeId, label, event) {
      candidate = { kind: 'move', nodeId, label, x: event.clientX, y: event.clientY }
      listen()
    },
  }
}
