import { ref, watch, type Ref } from 'vue'
import type { ComposerStore } from './composer-store'

export interface ComposerHistory {
  undo(): void
  redo(): void
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  /** Flush the pending snapshot immediately (tests). */
  commit(): void
  dispose(): void
}

/**
 * Undo/redo over the composed-block definition. Snapshots the whole definition
 * as JSON; rapid edits coalesce into one entry via a trailing debounce.
 * Mirrors the page editor's `createHistory`, scoped to the composer store.
 */
export function createComposerHistory(store: ComposerStore, delay = 350): ComposerHistory {
  const past: string[] = []
  const future: string[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)

  const snapshot = () => JSON.stringify(store.snapshot())
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
    () => store.def,
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
