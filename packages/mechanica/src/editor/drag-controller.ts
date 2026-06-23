import { reactive, type InjectionKey } from 'vue'
import type { EditorStore } from './store'
import type { DropPosition } from './content-tree'
import { isEditorUI } from './use-block-frames'

export type DragPayload =
  | { kind: 'new'; blockId: string; label: string }
  | { kind: 'move'; id: string; label: string }

export interface DragIndicator {
  top: number
  left: number
  width: number
}

export interface DragController {
  /** The active drag, once it passes the movement threshold. */
  payload: DragPayload | null
  /** Pointer position (for the drag ghost). */
  x: number
  y: number
  /** The insertion-line indicator, when over a valid drop target. */
  indicator: DragIndicator | null
  /** Begin a potential drag; `onTap` runs if the pointer is released without dragging. */
  begin(payload: DragPayload, event: PointerEvent, onTap?: () => void): void
}

export const dragKey: InjectionKey<DragController> = Symbol('mech-drag')

const THRESHOLD = 6

export function createDragController(store: EditorStore): DragController {
  let pending: DragPayload | null = null
  let onTap: (() => void) | undefined
  let origin = { x: 0, y: 0 }
  let drop: DropPosition | null = null

  const state = reactive<DragController>({
    payload: null,
    x: 0,
    y: 0,
    indicator: null,
    begin,
  })

  function begin(payload: DragPayload, event: PointerEvent, tap?: () => void) {
    pending = payload
    onTap = tap
    origin = { x: event.clientX, y: event.clientY }
    state.x = event.clientX
    state.y = event.clientY
    drop = null
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function onMove(event: PointerEvent) {
    state.x = event.clientX
    state.y = event.clientY
    if (!state.payload) {
      if (Math.abs(event.clientX - origin.x) < THRESHOLD && Math.abs(event.clientY - origin.y) < THRESHOLD) {
        return
      }
      state.payload = pending // threshold crossed → drag is live
    }
    compute(event.clientX, event.clientY)
  }

  function compute(x: number, y: number) {
    const element = document.elementFromPoint(x, y)

    // Hierarchy rows are valid drop targets (even though they're editor UI).
    const row = element?.closest?.('[data-tree-id]') as HTMLElement | null
    if (row?.dataset.treeId) {
      setDrop(row.getBoundingClientRect(), y, row.dataset.treeId)
      return
    }

    if (!element || isEditorUI(element)) {
      clearDrop()
      return
    }

    const target = topLevelTarget(element)
    if (target) {
      setDrop(target.getBoundingClientRect(), y, target.getAttribute('data-block-id')!)
    } else {
      appendToRoot()
    }
  }

  function setDrop(rect: DOMRect, y: number, anchorId: string) {
    const before = y < rect.top + rect.height / 2
    drop = { anchorId, position: before ? 'before' : 'after' }
    state.indicator = { top: before ? rect.top : rect.bottom, left: rect.left, width: rect.width }
  }

  function appendToRoot() {
    drop = { anchorId: null, position: 'after' }
    const app = (document.querySelector('#app') ?? document.body) as HTMLElement
    const rect = app.getBoundingClientRect()
    state.indicator = { top: rect.bottom, left: rect.left, width: rect.width }
  }

  function clearDrop() {
    drop = null
    state.indicator = null
  }

  /** The outermost ancestor whose data-block-id is a top-level content block. */
  function topLevelTarget(element: Element): Element | null {
    let node: Element | null = element
    let found: Element | null = null
    while (node) {
      const id = node.getAttribute?.('data-block-id')
      if (id && store.content.some((block) => block.id === id)) found = node
      node = node.parentElement
    }
    return found
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    if (state.payload && drop) {
      if (state.payload.kind === 'new') store.addBlockAt(state.payload.blockId, drop)
      else store.relocate(state.payload.id, drop)
    } else if (!state.payload) {
      onTap?.()
    }
    state.payload = null
    state.indicator = null
    pending = null
    drop = null
  }

  return state
}
