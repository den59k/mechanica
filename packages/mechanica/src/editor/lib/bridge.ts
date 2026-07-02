import type { ContentBlock, PageMeta } from '@mechanica/shared'

/** Global handle the runtime exposes for the in-page editor to drive. */
const RUNTIME_KEY = '__MECHANICA_RUNTIME__'
/** Versioned message type for editor → runtime state updates. */
const MESSAGE_TYPE = 'mechanica:update-state'
const PROTOCOL_VERSION = 1

export interface StateUpdatePayload {
  content: ContentBlock[]
  data?: Record<string, unknown>
  /** Sent when the editor switches pages in place. */
  page?: PageMeta
}

export interface StateUpdateMessage {
  type: typeof MESSAGE_TYPE
  version: typeof PROTOCOL_VERSION
  payload: StateUpdatePayload
}

/** The runtime surface the editor drives through the bridge. */
export interface BridgeRuntime {
  setContent(content: ContentBlock[]): void
  mergeData(data: Record<string, unknown>): void
  /** Replace the current page's metadata (in-place page switch). */
  setPage?(page: PageMeta): void
}

/**
 * Merge incoming data into the live data object: assign new values and drop keys
 * that disappeared from an entry, while keeping the same object references so
 * Vue reactivity stays intact.
 */
export function mergeData(target: Record<string, unknown>, incoming: Record<string, unknown>): void {
  for (const [id, value] of Object.entries(incoming)) {
    const current = (target[id] ??= {}) as Record<string, unknown>
    const next = (value ?? {}) as Record<string, unknown>
    for (const key of Object.keys(current)) {
      if (!(key in next)) delete current[key]
    }
    Object.assign(current, next)
  }
}

function isStateUpdate(data: unknown): data is StateUpdateMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as StateUpdateMessage).type === MESSAGE_TYPE &&
    (data as StateUpdateMessage).version === PROTOCOL_VERSION
  )
}

/**
 * Called by the runtime (client/dev) to expose itself and listen for editor
 * updates posted into the same window. Returns a disposer.
 */
export function exposeRuntime(runtime: BridgeRuntime): () => void {
  if (typeof window === 'undefined') return () => {}

  ;(window as unknown as Record<string, unknown>)[RUNTIME_KEY] = runtime

  const onMessage = (event: MessageEvent) => {
    if (!isStateUpdate(event.data)) return
    const { content, data, page } = event.data.payload
    runtime.setContent(content)
    if (data) runtime.mergeData(data)
    if (page) runtime.setPage?.(page)
  }

  window.addEventListener('message', onMessage)
  return () => {
    window.removeEventListener('message', onMessage)
    if ((window as unknown as Record<string, unknown>)[RUNTIME_KEY] === runtime) {
      delete (window as unknown as Record<string, unknown>)[RUNTIME_KEY]
    }
  }
}

/** Called by the editor to push a state update to the runtime in the same window. */
export function pushStateUpdate(payload: StateUpdatePayload): void {
  const message: StateUpdateMessage = { type: MESSAGE_TYPE, version: PROTOCOL_VERSION, payload }
  window.postMessage(message, '*')
}

/** Whether a runtime is currently exposed (i.e. a Mechanica app is mounted). */
export function hasRuntime(): boolean {
  return typeof window !== 'undefined' && RUNTIME_KEY in window
}
