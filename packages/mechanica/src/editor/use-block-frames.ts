import { onScopeDispose, ref } from 'vue'
import type { EditorStore } from './store'

export interface BlockRect {
  id: string
  top: number
  left: number
  width: number
  height: number
}

/** Walk up from an element to the nearest one carrying a `data-block-id`. */
export function findBlockId(element: Element | null): string | null {
  let node: Element | null = element
  while (node) {
    const id = node.getAttribute?.('data-block-id')
    if (id) return id
    node = node.parentElement
  }
  return null
}

/** Whether an element is inside the editor UI (marked with `data-mech-ui`). */
export function isEditorUI(element: Element | null): boolean {
  let node: Element | null = element
  while (node) {
    if (node.hasAttribute?.('data-mech-ui')) return true
    node = node.parentElement
  }
  return false
}

function rectOf(id: string): BlockRect | null {
  const element = document.querySelector(`[data-block-id="${id}"]`)
  if (!element) return null
  const r = element.getBoundingClientRect()
  return { id, top: r.top, left: r.left, width: r.width, height: r.height }
}

/**
 * Track hover/selection frames over the live page: hovering a block shows a
 * frame, clicking selects it (driving the store). The selected frame stays glued
 * to its block via a requestAnimationFrame loop.
 */
export function useBlockFrames(store: EditorStore) {
  const hovered = ref<BlockRect | null>(null)
  const selected = ref<BlockRect | null>(null)

  const onMove = (event: MouseEvent) => {
    const target = event.target as Element
    if (isEditorUI(target)) {
      hovered.value = null
      return
    }
    const id = findBlockId(target)
    hovered.value = id ? rectOf(id) : null
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element
    if (isEditorUI(target)) return
    const id = findBlockId(target)
    if (!id) return
    event.preventDefault()
    event.stopPropagation()
    store.select(id)
  }

  const onScroll = () => {
    hovered.value = null
  }

  let frame = 0
  const tick = () => {
    selected.value = store.selectedId ? rectOf(store.selectedId) : null
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  window.addEventListener('scroll', onScroll, true)

  onScopeDispose(() => {
    cancelAnimationFrame(frame)
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
    window.removeEventListener('scroll', onScroll, true)
  })

  return { hovered, selected }
}
