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
 * Track hover/selection frames over the live page. Hover is shared state on the
 * store (`hoverId`), so moving over the page *or* a hierarchy row frames the same
 * block — keeping the two surfaces visually in sync. Clicking a block selects it.
 * Both frames stay glued to their block via a requestAnimationFrame loop, so they
 * follow layout and scrolling.
 */
export function useBlockFrames(store: EditorStore) {
  const hovered = ref<BlockRect | null>(null)
  const selected = ref<BlockRect | null>(null)

  const onMove = (event: MouseEvent) => {
    // Over editor chrome (including the tree): leave hover to the tree's own
    // mouseenter/leave, so hovering a row keeps framing its block on the page.
    const target = event.target as Element
    if (isEditorUI(target)) return
    store.setHover(findBlockId(target))
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

  let frame = 0
  const tick = () => {
    selected.value = store.selectedId ? rectOf(store.selectedId) : null
    hovered.value = store.hoverId ? rectOf(store.hoverId) : null
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)

  onScopeDispose(() => {
    cancelAnimationFrame(frame)
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
  })

  return { hovered, selected }
}
