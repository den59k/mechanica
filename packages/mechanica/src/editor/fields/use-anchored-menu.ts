import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue'

export interface AnchoredMenu {
  /** Whether the menu is currently open. */
  open: Ref<boolean>
  /** Inline `style` for the teleported menu (fixed position, anchored to the trigger). */
  menuStyle: Ref<Record<string, string>>
  openMenu: () => Promise<void>
  close: () => void
  /** Recompute the menu position against the anchor (called on scroll/resize). */
  position: () => void
}

/**
 * Shared open/close + positioning for a popover menu teleported to `<body>`
 * (so it is never clipped by a scrolling panel). The menu is anchored to the
 * trigger element, matches its width, and flips above when space is tight.
 * Clicking outside the anchor or the menu closes it.
 *
 * Component-specific concerns (active index, keyboard selection) stay in the
 * component; this only owns geometry and the document-level listeners.
 */
export function useAnchoredMenu(
  getAnchor: () => HTMLElement | null,
  getMenu: () => HTMLElement | null,
): AnchoredMenu {
  const open = ref(false)
  const menuStyle = ref<Record<string, string>>({})

  function position() {
    const el = getAnchor()
    if (!el) return
    const rect = el.getBoundingClientRect()
    const GAP = 6
    const MARGIN = 8
    const MAX = 280
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN
    const spaceAbove = rect.top - MARGIN
    const flip = spaceBelow < Math.min(MAX, 200) && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.min(MAX, flip ? spaceAbove : spaceBelow))
    menuStyle.value = {
      position: 'fixed',
      left: `${Math.round(rect.left)}px`,
      width: `${Math.round(rect.width)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      ...(flip
        ? { bottom: `${Math.round(window.innerHeight - rect.top + GAP)}px` }
        : { top: `${Math.round(rect.bottom + GAP)}px` }),
    }
  }

  const onDocPointer = (event: PointerEvent) => {
    const target = event.target as Node
    if (getAnchor()?.contains(target) || getMenu()?.contains(target)) return
    close()
  }
  const onScroll = () => position()

  async function openMenu() {
    if (open.value) return
    open.value = true
    position()
    await nextTick()
    position()
    window.addEventListener('pointerdown', onDocPointer, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
  }

  function close() {
    if (!open.value) return
    open.value = false
    window.removeEventListener('pointerdown', onDocPointer, true)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
  }

  onBeforeUnmount(close)
  return { open, menuStyle, openMenu, close, position }
}
