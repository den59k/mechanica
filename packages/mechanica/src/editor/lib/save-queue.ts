import { reactive } from 'vue'

/**
 * Lifecycle of the page's persistence:
 * `saved` — everything the user did is on disk;
 * `pending` — edits are waiting for the debounce window;
 * `saving` — a save request is in flight;
 * `error` — the last save failed and the snapshot is retained for retry;
 * `conflict` — the page changed on disk under the editor (the server rejected
 *   the save); the user must choose to reload or overwrite.
 */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'

/** Throw from `send` to signal a version conflict (page changed on disk). */
export class SaveConflictError extends Error {
  constructor(message = 'Page changed on disk') {
    super(message)
    this.name = 'SaveConflictError'
  }
}

export interface SaveQueueOptions<T> {
  /** Persist a snapshot; reject to signal failure. */
  send: (snapshot: T) => Promise<void>
  /**
   * Best-effort synchronous sender used while the page unloads
   * (`navigator.sendBeacon`). Returns whether the payload was queued.
   */
  beacon?: (snapshot: T) => boolean
  /** Debounce window in ms before a pushed snapshot is sent. */
  delay?: number
}

export interface SaveQueue<T> {
  /** Reactive save status, for the toolbar indicator. */
  readonly status: SaveStatus
  /** Queue the latest snapshot (previous unsent snapshots are superseded). */
  push(snapshot: T): void
  /** Whether edits exist that the server has not confirmed. */
  hasUnsaved(): boolean
  /** Re-send the last snapshot after a failure or conflict. */
  retry(): void
  /** Drop unsaved edits (conflict resolution: the on-disk version wins). */
  discard(): void
  /**
   * Flush pending edits synchronously on unload via the beacon.
   * Returns true when nothing would be lost by leaving the page.
   */
  flushOnUnload(): boolean
  dispose(): void
}

/**
 * Debounced, status-tracking save pipeline. Only the newest snapshot is ever
 * sent; a failure keeps it around (status `error`) until `retry()` or a newer
 * edit re-triggers the send. No automatic retry loop — the UI surfaces the
 * failure instead.
 */
export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  const delay = options.delay ?? 500
  const state = reactive({ status: 'saved' as SaveStatus })

  let timer: ReturnType<typeof setTimeout> | null = null
  let last: T | null = null
  /** A snapshot exists that the server hasn't confirmed yet. */
  let unsaved = false
  let inflight = false

  const cancelTimer = () => {
    if (timer != null) clearTimeout(timer)
    timer = null
  }

  async function send(): Promise<void> {
    if (inflight || last == null) return
    inflight = true
    cancelTimer()
    state.status = 'saving'
    const snapshot = last
    try {
      await options.send(snapshot)
      // Confirmed — unless newer edits arrived while the request was in flight.
      if (last === snapshot) {
        unsaved = false
        state.status = 'saved'
      } else {
        state.status = 'pending'
        schedule()
      }
    } catch (error) {
      state.status = error instanceof SaveConflictError ? 'conflict' : 'error'
    } finally {
      inflight = false
    }
  }

  const schedule = () => {
    cancelTimer()
    timer = setTimeout(() => void send(), delay)
  }

  return {
    get status() {
      return state.status
    },
    push(snapshot: T) {
      last = snapshot
      unsaved = true
      if (!inflight) state.status = 'pending'
      schedule()
    },
    hasUnsaved: () => unsaved || inflight,
    retry() {
      if (state.status !== 'error' && state.status !== 'conflict') return
      void send()
    },
    discard() {
      cancelTimer()
      last = null
      unsaved = false
      state.status = 'saved'
    },
    flushOnUnload() {
      if (!unsaved && !inflight) return true
      // A conflict needs an explicit choice — the beacon would either clobber
      // the external edit or be rejected; never resolve it silently.
      if (state.status === 'conflict') return false
      if (!options.beacon || last == null) return false
      const queued = options.beacon(last)
      if (queued) {
        unsaved = false
        cancelTimer()
        state.status = 'saved'
      }
      return queued
    },
    dispose: cancelTimer,
  }
}
