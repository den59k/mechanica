import { reactive } from 'vue'
import { findBlock } from '../../lib/content-tree'
import type { ComposerStore } from './composer-store'

/** Where a dragged layer would land, relative to a target row. */
export interface DropTarget {
  id: string
  position: 'before' | 'after' | 'inside'
}

export interface LayerDnd {
  readonly dragId: string | null
  readonly target: DropTarget | null
  /** Whether the click that just ended a drag should be swallowed (not a select). */
  readonly suppressClick: boolean
  /** Arm a drag from a layer row's pointerdown; it begins after a small move. */
  arm(id: string, event: PointerEvent): void
}

const DRAG_THRESHOLD = 4

/**
 * Pointer drag-and-drop for the composer layers tree: reorder within a parent
 * and reparent into frames. Drop position comes from the pointer's vertical
 * position over the target row — top half `before`, bottom half `after`, and the
 * middle band of a container row `inside`. `relocateBlock` refuses drops into a
 * node's own subtree, so a bad target is just a no-op.
 */
export function useLayerDnd(store: ComposerStore, isContainer: (id: string) => boolean): LayerDnd {
  const state = reactive({
    dragId: null as string | null,
    target: null as DropTarget | null,
    suppressClick: false,
  })
  let candidate: { id: string; x: number; y: number } | null = null

  const computeTarget = (event: PointerEvent): void => {
    const row = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest(
      '[data-layer-id]',
    ) as HTMLElement | null
    if (!row) {
      state.target = null
      return
    }
    const id = row.getAttribute('data-layer-id')!
    if (id === state.dragId || (state.dragId && findBlock([findBlock(store.template, state.dragId)!], id))) {
      state.target = null // dropping into self/descendant
      return
    }
    const rect = row.getBoundingClientRect()
    const rel = (event.clientY - rect.top) / rect.height
    let position: DropTarget['position']
    if (isContainer(id) && rel > 0.3 && rel < 0.7) position = 'inside'
    else position = rel < 0.5 ? 'before' : 'after'
    state.target = { id, position }
  }

  const onMove = (event: PointerEvent): void => {
    if (!state.dragId && candidate) {
      const moved = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y)
      if (moved > DRAG_THRESHOLD) state.dragId = candidate.id
    }
    if (state.dragId) computeTarget(event)
  }

  const onUp = (): void => {
    const dragged = state.dragId != null
    if (state.dragId && state.target) {
      store.relocate(state.dragId, { anchorId: state.target.id, position: state.target.position })
    }
    candidate = null
    state.dragId = null
    state.target = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    if (dragged) {
      // Swallow the click that follows this pointerup so it doesn't re-select.
      state.suppressClick = true
      setTimeout(() => (state.suppressClick = false), 0)
    }
  }

  return {
    get dragId() {
      return state.dragId
    },
    get target() {
      return state.target
    },
    get suppressClick() {
      return state.suppressClick
    },
    arm(id: string, event: PointerEvent) {
      candidate = { id, x: event.clientX, y: event.clientY }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
  }
}
