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

/** The nearest anchor (with an href) a click landed on, if any. */
export function findLink(element: Element | null): HTMLAnchorElement | null {
  const link = element?.closest?.('a[href]')
  return link instanceof HTMLAnchorElement ? link : null
}

/**
 * What a click on a link inside the live page should do: `'native'` leaves it
 * to the browser (modified clicks, new tabs, downloads, external targets,
 * same-page hash jumps), `'follow'` switches the editor to the target page in
 * place — the runtime's own SPA navigation must not run under the editor, or
 * saves would target the old page's path with the new page's URL.
 */
export function linkClickAction(
  link: HTMLAnchorElement,
  event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): 'native' | 'follow' {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return 'native'
  if (link.target === '_blank' || link.hasAttribute('download')) return 'native'
  if (link.origin !== location.origin) return 'native'
  if (link.pathname === location.pathname && link.hash) return 'native'
  return 'follow'
}

export interface BlockFramesOptions {
  /** Follow an internal page link clicked on the live page (in-place switch). */
  followLink?: (path: string) => void
  /**
   * Whether the editor overlay is active. When this returns `false` (the panels
   * are collapsed), the overlay stops touching the live page entirely — it no
   * longer hovers or selects blocks, and clicks on buttons, links and every
   * other control behave natively, so the page is usable like the published
   * site. `true`/absent keeps the editing behavior (block selection, links
   * followed in place).
   */
  enabled?: () => boolean
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
 * block — keeping the two surfaces visually in sync. Clicking a block selects it,
 * except on links — those stay followable (internal ones through `followLink`).
 * Both frames stay glued to their block via a requestAnimationFrame loop, so they
 * follow layout and scrolling.
 */
export function useBlockFrames(store: EditorStore, options: BlockFramesOptions = {}) {
  const hovered = ref<BlockRect | null>(null)
  const selected = ref<BlockRect | null>(null)
  const active = () => options.enabled?.() ?? true

  const onMove = (event: MouseEvent) => {
    // Panels collapsed: hands off the page, and drop any lingering hover frame.
    if (!active()) {
      if (store.hoverId) store.setHover(null)
      return
    }
    // Over editor chrome (including the tree): leave hover to the tree's own
    // mouseenter/leave, so hovering a row keeps framing its block on the page.
    const target = event.target as Element
    if (isEditorUI(target)) return
    store.setHover(findBlockId(target))
  }

  const onClick = (event: MouseEvent) => {
    // Panels collapsed: let buttons, links and every control click natively.
    if (!active()) return
    const target = event.target as Element
    if (isEditorUI(target)) return
    const link = findLink(target)
    if (link) {
      if (linkClickAction(link, event) === 'native' || !options.followLink) return
      event.preventDefault()
      event.stopPropagation()
      options.followLink(link.pathname)
      return
    }
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
