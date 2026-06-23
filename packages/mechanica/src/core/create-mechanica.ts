import { shallowRef, type App, type Plugin } from 'vue'
import type { ContentBlock, State } from '@mechanica/shared'
import { mechanicaKey, type BlocksMap, type MechanicaContext } from './state'

export interface CreateMechanicaOptions {
  /** Initial runtime state. Defaults to `window.state` (client hydration). */
  state?: State
  /** Block components keyed by `blockId` (from the blocks virtual module). */
  blocks?: BlocksMap
}

/**
 * Vue plugin that wires the Mechanica runtime: it exposes the page content,
 * shared data and block set via {@link mechanicaKey}. The generated client and
 * SSR entries call this; apps rarely call it directly (see `defineMechanicaApp`).
 */
export function createMechanica(options: CreateMechanicaOptions = {}): Plugin {
  return {
    install(app: App) {
      const initial = options.state ?? readWindowState()
      const content = shallowRef<ContentBlock[]>(initial?.content ?? [])

      const context: MechanicaContext = {
        content,
        data: initial?.data ?? {},
        blocks: options.blocks ?? new Map(),
      }

      app.provide(mechanicaKey, context)
    },
  }
}

function readWindowState(): State | undefined {
  return typeof window !== 'undefined' ? ((window as { state?: State }).state) : undefined
}
