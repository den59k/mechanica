import { reactive, type InjectionKey } from 'vue'

/** One row in a context menu. */
export interface ContextMenuItem {
  label: string
  /** Render in the danger (red) style. */
  danger?: boolean
  /** Greyed out and non-clickable. */
  disabled?: boolean
  /** Draw a divider above this item. */
  separatorBefore?: boolean
  /** Show a check mark (for one-of-N state like column alignment). */
  checked?: boolean
  onClick?: () => void
}

/**
 * Cursor-anchored context-menu state. Provided once by the editor shell, opened
 * from anywhere via `openAt`, and rendered by a single `<VContextMenu>`.
 */
export interface ContextMenuController {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  /** Open the menu at the event's cursor position with the given items. */
  openAt(event: MouseEvent, items: ContextMenuItem[]): void
  close(): void
}

export const contextMenuKey: InjectionKey<ContextMenuController> = Symbol('mech-context-menu')

/** Create the reactive context-menu controller (provided once by the editor shell). */
export function createContextMenu(): ContextMenuController {
  const state = reactive<ContextMenuController>({
    open: false,
    x: 0,
    y: 0,
    items: [] as ContextMenuItem[],
    openAt(event, items) {
      event.preventDefault()
      state.items = items
      state.x = event.clientX
      state.y = event.clientY
      state.open = true
    },
    close() {
      state.open = false
    },
  })
  return state
}
