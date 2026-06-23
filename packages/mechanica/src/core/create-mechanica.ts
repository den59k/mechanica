import { shallowRef, type App, type Plugin } from 'vue'
import type { ContentBlock, State } from '@mechanica/shared'
import {
  mechanicaKey,
  type BlocksMap,
  type MechanicaContext,
  type MechanicaMode,
  type QueryResolver,
} from './state'
import { createRouter } from './router'
import { exposeRuntime, mergeData } from '../editor/lib/bridge'

export interface CreateMechanicaOptions {
  /** Initial runtime state. Defaults to `window.state` (client hydration). */
  state?: State
  /** Block components keyed by `blockId` (from the blocks virtual module). */
  blocks?: BlocksMap
  /** Execution mode. Defaults to `'client'`. */
  mode?: MechanicaMode
  /** Query resolver for server/dev modes. */
  resolveQuery?: QueryResolver
}

/**
 * Vue plugin that wires the Mechanica runtime: page content, shared data, the
 * block set, the router and query resolution, exposed via {@link mechanicaKey}.
 * The generated client/SSR entries call this (see `defineMechanicaApp`).
 */
export function createMechanica(options: CreateMechanicaOptions = {}): Plugin {
  return {
    install(app: App) {
      const mode = options.mode ?? 'client'
      const initial = options.state ?? readWindowState()
      const content = shallowRef<ContentBlock[]>(initial?.content ?? [])
      const data = (initial?.data ?? {}) as Record<string, unknown>

      const context: MechanicaContext = {
        mode,
        content,
        data,
        blocks: options.blocks ?? new Map(),
        router: createRouter(content, data, { mode, baseUrl: initial?.baseUrl }),
        queryData: (initial?.query ?? {}) as Record<string, unknown>,
        resolveQuery: options.resolveQuery,
        page: initial?.page ?? {},
      }

      app.provide(mechanicaKey, context)

      // Expose the runtime so the in-page editor can drive it live.
      if (mode !== 'server') {
        exposeRuntime({
          setContent: (next) => {
            content.value = next
          },
          mergeData: (incoming) => mergeData(context.data, incoming),
        })
      }
    },
  }
}

function readWindowState(): State | undefined {
  return typeof window !== 'undefined' ? ((window as { state?: State }).state) : undefined
}
