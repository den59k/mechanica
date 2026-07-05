import type { Component, InjectionKey, ShallowRef } from 'vue'
import type { ContentBlock, LocalesConfig, PageMeta } from 'mechanica-shared'
import type { MechanicaRouter } from './router'

/** Block components keyed by their `blockId`. */
export type BlocksMap = Map<string, Component>

/** Which runtime the app is executing in. */
export type MechanicaMode = 'client' | 'server' | 'dev'

/** Resolves a query key to its result (server/dev provide their own). */
export type QueryResolver = (key: string) => Promise<unknown> | unknown

/** Runtime context provided by {@link createMechanica} and read across the runtime. */
export interface MechanicaContext {
  /** Execution mode. */
  mode: MechanicaMode
  /** The current page's block tree. */
  content: ShallowRef<ContentBlock[]>
  /** Shared data values keyed by data-entry id. */
  data: Record<string, unknown>
  /** Available block components. */
  blocks: BlocksMap
  /** Client-side router. */
  router: MechanicaRouter
  /** Pre-resolved query results (client hydration). */
  queryData: Record<string, unknown>
  /** Query resolver for server/dev modes. */
  resolveQuery?: QueryResolver
  /** Current page metadata. */
  page: PageMeta
  /** The site's locale config (multi-language sites); absent when i18n is off. */
  locales?: LocalesConfig
}

/** Vue injection key for the {@link MechanicaContext}. */
export const mechanicaKey: InjectionKey<MechanicaContext> = Symbol('mechanica')
