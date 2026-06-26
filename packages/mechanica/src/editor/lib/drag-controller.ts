import { reactive, type InjectionKey } from 'vue'
import type { EditorStore } from './store'
import { findBlock, findParentSlot, type DropPosition } from './content-tree'
import { isEditorUI } from './use-block-frames'

export type DragPayload =
  | { kind: 'new'; blockId: string; label: string }
  | { kind: 'move'; id: string; label: string }

export interface DragIndicator {
  top: number
  left: number
  width: number
  /** Present for the container box (outlines a region); absent for the line. */
  height?: number
  /** Shown on the box — the name of the target named slot. */
  label?: string
  /**
   * Box only: draw the outline (the pointer is over the container itself), versus
   * a plain fill (the drop is at a child position *within* the container).
   */
  outline?: boolean
}

/** The container a drop lands in: a parent block and one of its slots. */
export interface DropContainer {
  parentId: string
  /** `'default'` for an unnamed slot. */
  slot: string
}

export interface DragController {
  /** The active drag, once it passes the movement threshold. */
  payload: DragPayload | null
  /** Pointer position (for the drag ghost). */
  x: number
  y: number
  /**
   * The canonical drop location. Everything else is derived from this one value,
   * so dragging over either surface previews the drop on *both* (tree ↔ page).
   */
  drop: DropPosition | null
  /**
   * The enclosing container (parent block + slot) the drop falls into — null at
   * the root. Both surfaces highlight it, so an insertion *inside* a slot shows
   * its parent and slot, not just the bare line.
   */
  container: DropContainer | null
  /** Page insertion line (before/after); null for a pure inside drop. */
  domLine: DragIndicator | null
  /** Page box around the container; carries the slot name for named slots. */
  domBox: DragIndicator | null
  /** Begin a potential drag; `onTap` runs if the pointer is released without dragging. */
  begin(payload: DragPayload, event: PointerEvent, onTap?: () => void): void
}

export const dragKey: InjectionKey<DragController> = Symbol('mech-drag')

const THRESHOLD = 6

export function createDragController(store: EditorStore): DragController {
  let pending: DragPayload | null = null
  let onTap: (() => void) | undefined
  let origin = { x: 0, y: 0 }

  const state = reactive<DragController>({
    payload: null,
    x: 0,
    y: 0,
    drop: null,
    container: null,
    domLine: null,
    domBox: null,
    begin,
  })

  function begin(payload: DragPayload, event: PointerEvent, tap?: () => void) {
    pending = payload
    onTap = tap
    origin = { x: event.clientX, y: event.clientY }
    state.x = event.clientX
    state.y = event.clientY
    setDrop(null)
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

  /** Resolve the pointer to a single logical drop (the visuals follow from it). */
  function compute(x: number, y: number) {
    const element = document.elementFromPoint(x, y)

    // 1. A named-slot node in the tree → drop into exactly that slot (the only
    //    way to target a specific named slot).
    const slotEl = element?.closest?.('[data-tree-slot]') as HTMLElement | null
    if (slotEl?.dataset.treeSlot) {
      const sep = slotEl.dataset.treeSlot.indexOf(':')
      setDrop({
        anchorId: slotEl.dataset.treeSlot.slice(0, sep),
        position: 'inside',
        slot: slotEl.dataset.treeSlot.slice(sep + 1),
      })
      return
    }

    // 2. A hierarchy row → before / after / inside-its-default-slot.
    const row = element?.closest?.('[data-tree-id]') as HTMLElement | null
    if (row?.dataset.treeId) {
      anchorDrop(row.getBoundingClientRect(), y, row.dataset.treeId)
      return
    }

    // 3. Editor chrome (panels, toolbar, dialogs) → no drop.
    if (!element || isEditorUI(element)) {
      setDrop(null)
      return
    }

    // 4. The live page → the nearest rendered block at any depth.
    const blockEl = element.closest('[data-block-id]') as HTMLElement | null
    if (blockEl?.dataset.blockId) {
      anchorDrop(blockEl.getBoundingClientRect(), y, blockEl.dataset.blockId)
    } else {
      setDrop({ anchorId: null, position: 'after' }) // empty page → append to root
    }
  }

  /**
   * Three vertical zones around a block: the outer thirds insert before/after it,
   * the middle third nests *inside* — but only when the block declares a default
   * slot, so non-containers (and named-slot-only blocks) stay flat. This is shared
   * by tree rows and live-page blocks so both behave identically.
   */
  function anchorDrop(rect: DOMRect, y: number, anchorId: string) {
    const third = rect.height / 3
    if (hasDefaultSlot(anchorId) && y >= rect.top + third && y <= rect.bottom - third) {
      setDrop({ anchorId, position: 'inside', slot: 'default' })
    } else {
      setDrop({ anchorId, position: y < rect.top + rect.height / 2 ? 'before' : 'after' })
    }
  }

  /** Whether the block behind an id declares an unnamed default slot. */
  function hasDefaultSlot(blockId: string): boolean {
    const block = findBlock(store.content, blockId)
    if (!block) return false
    return !!store.blocksById.get(block.blockId)?.slots?.default
  }

  /** Set the logical drop and re-project it (container + line) onto the live page. */
  function setDrop(next: DropPosition | null) {
    state.drop = next
    const container = next ? containerOf(next) : null
    state.container = container
    // Outline the box only when the pointer is over the container itself (a direct
    // 'inside' drop); a child-position drop just fills it, paired with the line.
    state.domBox = container ? boxFor(container, next!.position === 'inside') : null
    state.domLine = next && next.position !== 'inside' ? lineFor(next) : null
  }

  /** The container a drop lands in: explicit for 'inside', else the anchor's parent. */
  function containerOf(drop: DropPosition): DropContainer | null {
    if (drop.anchorId === null) return null
    if (drop.position === 'inside') return { parentId: drop.anchorId, slot: drop.slot ?? 'default' }
    const found = findParentSlot(store.content, drop.anchorId)
    return found ? { parentId: found.parent.id, slot: found.slot } : null
  }

  /** A box around the container's parent block; a named slot adds its name as a label. */
  function boxFor(container: DropContainer, outline: boolean): DragIndicator | null {
    const el = document.querySelector(`[data-block-id="${container.parentId}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const label = container.slot !== 'default' ? container.slot : undefined
    return { top: r.top, left: r.left, width: r.width, height: r.height, label, outline }
  }

  /** The before/after insertion line over the live page. */
  function lineFor(drop: DropPosition): DragIndicator | null {
    if (drop.anchorId === null) {
      const app = (document.querySelector('#app') ?? document.body) as HTMLElement
      const r = app.getBoundingClientRect()
      return { top: r.bottom, left: r.left, width: r.width }
    }
    const el = document.querySelector(`[data-block-id="${drop.anchorId}"]`)
    if (!el) return null // anchor isn't on the page (e.g. inside a collapsed branch)
    const r = el.getBoundingClientRect()
    return { top: drop.position === 'before' ? r.top : r.bottom, left: r.left, width: r.width }
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    const drop = state.drop
    if (state.payload && drop) {
      if (state.payload.kind === 'new') store.addBlockAt(state.payload.blockId, drop)
      else store.relocate(state.payload.id, drop)
    } else if (!state.payload) {
      onTap?.()
    }
    state.payload = null
    setDrop(null)
    pending = null
  }

  return state
}
