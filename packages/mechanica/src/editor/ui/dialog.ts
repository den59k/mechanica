import { shallowReactive, inject, type Component, type InjectionKey } from 'vue'

/** One entry on the dialog stack: a component and the props to render it with. */
export interface DialogEntry {
  /** Stable identity so the host keeps each dialog mounted as the stack grows. */
  id: number
  component: Component
  props?: Record<string, unknown>
}

/** A stack-based dialog system: opening pushes, the host renders the top one. */
export interface DialogStore {
  stack: DialogEntry[]
  /** Push a dialog onto the stack. */
  open(component: Component, props?: Record<string, unknown>): void
  /** Pop the top dialog (one step back). */
  back(): void
  /** Close every dialog. */
  close(): void
}

export const dialogKey: InjectionKey<DialogStore> = Symbol('mech-dialog')

/** Create the reactive dialog store (provided once by the editor shell). */
export function createDialogStore(): DialogStore {
  const stack = shallowReactive<DialogEntry[]>([])
  let nextId = 0
  return {
    stack,
    open(component, props) {
      stack.push({ id: ++nextId, component, props })
    },
    back() {
      stack.pop()
    },
    close() {
      stack.length = 0
    },
  }
}

/** Access the dialog store from any component inside the editor. */
export function useDialog(): DialogStore {
  const store = inject(dialogKey)
  if (!store) throw new Error('[mechanica] useDialog used outside the editor')
  return store
}
