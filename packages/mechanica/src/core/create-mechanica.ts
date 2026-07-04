import { shallowReactive, shallowRef, type App, type Plugin } from 'vue'
import type { ComposedBlockDefinition, ContentBlock, PageMeta, State } from 'mechanica-shared'
import {
  mechanicaKey,
  type BlocksMap,
  type MechanicaContext,
  type MechanicaMode,
  type QueryResolver,
} from './state'
import { createRouter } from './router'
import { loadBlocks, type BlockLoaders } from './load-blocks'
import { registerElements } from '../elements'
import { createComposedComponent } from './composed'
import { exposeRuntime, mergeData } from '../editor/lib/bridge'

export interface CreateMechanicaOptions {
  /** Initial runtime state. Defaults to `window.state` (client hydration). */
  state?: State
  /** Block components keyed by `blockId` (from the blocks virtual module). */
  blocks?: BlocksMap
  /**
   * Dynamic imports per block id (the lazy client build). When set, SPA
   * navigation loads a page's missing block chunks before rendering it.
   */
  blockLoaders?: BlockLoaders
  /**
   * Composed-block definitions (from `virtual:mechanica/composed`). Each is
   * registered into the block set as a component, and SPA navigation expands a
   * placed composed block into the compiled blocks its template uses so their
   * chunks load first.
   */
  composed?: ComposedBlockDefinition[]
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

      const blocks = options.blocks ?? new Map()
      const loaders = options.blockLoaders

      // Layout primitives always ship with the runtime; composed blocks are
      // registered as components and mapped by id for chunk expansion on nav.
      registerElements(blocks)
      const composedMap = new Map<string, ComposedBlockDefinition>()
      for (const def of options.composed ?? []) {
        composedMap.set(def.id, def)
        blocks.set(def.id, createComposedComponent(def))
      }

      // Reactive so <Content> re-keys blocks when e.g. the pagination context
      // changes. Wraps the state's own object, so mutations write through
      // (the dev query resolver reads `window.state.page` directly).
      const page = shallowReactive<PageMeta>(initial?.page ?? {})
      const queryData = (initial?.query ?? {}) as Record<string, unknown>

      const applyPage = (next: PageMeta) => {
        // Same object, so everything holding the context sees the switch.
        for (const key of Object.keys(page)) delete (page as Record<string, unknown>)[key]
        Object.assign(page, next)
      }

      const context: MechanicaContext = {
        mode,
        content,
        data,
        blocks,
        router: createRouter(content, data, {
          mode,
          baseUrl: initial?.baseUrl,
          ensureBlocks: loaders
            ? async (next) => {
                await loadBlocks(loaders, next, blocks, composedMap)
              }
            : undefined,
          // SPA navigation carries the target page's meta and baked query
          // results; blocks remounted for the new page must read *its* slice
          // under the same query key, not the previous page's.
          applyState: (state) => {
            if (state.page) applyPage(state.page)
            for (const key of Object.keys(queryData)) delete queryData[key]
            Object.assign(queryData, state.query ?? {})
          },
        }),
        queryData,
        resolveQuery: options.resolveQuery,
        page,
      }

      app.provide(mechanicaKey, context)

      // Expose the runtime so the in-page editor can drive it live.
      if (mode !== 'server') {
        exposeRuntime({
          setContent: (next) => {
            content.value = next
          },
          mergeData: (incoming) => mergeData(context.data, incoming),
          setPage: (next) => {
            applyPage(next)
            // Keep <Link> active classes in step with in-place page switches.
            if (next.path) context.router.currentRoute.path = context.router.normalizePath(next.path)
          },
        })
      }
    },
  }
}

function readWindowState(): State | undefined {
  return typeof window !== 'undefined' ? ((window as { state?: State }).state) : undefined
}
