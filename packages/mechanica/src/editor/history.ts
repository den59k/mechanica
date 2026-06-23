import { ref, watch } from 'vue'
import type { EditorStore } from './store'

export interface History {
  undo(): void
  redo(): void
  canUndo: ReturnType<typeof ref<boolean>>
  canRedo: ReturnType<typeof ref<boolean>>
  /** Flush a pending snapshot immediately (also used by tests). */
  commit(): void
  /** Stop watching + clear the pending timer. */
  dispose(): void
}

/**
 * Undo/redo over the editor state. Snapshots `{ content, data }` as JSON; rapid
 * edits (e.g. typing) coalesce into one entry via a trailing debounce. Restoring
 * sets the baseline to the restored snapshot so it never re-records itself.
 */
export function createHistory(store: EditorStore, delay = 350): History {
  const past: string[] = []
  const future: string[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)

  const snapshot = () => JSON.stringify({ content: store.content, data: store.data })
  let baseline = snapshot()

  const update = () => {
    canUndo.value = past.length > 0
    canRedo.value = future.length > 0
  }

  function commit() {
    const current = snapshot()
    if (current === baseline) return
    past.push(baseline)
    baseline = current
    future.length = 0
    update()
  }

  function restore(serialized: string) {
    store.replace(JSON.parse(serialized))
    baseline = serialized // so the change this triggers is not re-recorded
    update()
  }

  function undo() {
    if (!past.length) return
    future.push(baseline)
    restore(past.pop()!)
  }

  function redo() {
    if (!future.length) return
    past.push(baseline)
    restore(future.pop()!)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => [store.content, store.data],
    () => {
      clearTimeout(timer)
      timer = setTimeout(commit, delay)
    },
    { deep: true },
  )

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    commit,
    dispose() {
      clearTimeout(timer)
      stop()
    },
  }
}
