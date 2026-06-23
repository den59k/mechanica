import type { Component, InjectionKey, ShallowRef } from 'vue'
import type { ContentBlock } from '@mechanica/shared'

/** Block components keyed by their `blockId`. */
export type BlocksMap = Map<string, Component>

/** Runtime context provided by {@link createMechanica} and read across the runtime. */
export interface MechanicaContext {
  /** The current page's block tree. */
  content: ShallowRef<ContentBlock[]>
  /** Shared data values keyed by data-entry id. */
  data: Record<string, unknown>
  /** Available block components. */
  blocks: BlocksMap
}

/** Vue injection key for the {@link MechanicaContext}. */
export const mechanicaKey: InjectionKey<MechanicaContext> = Symbol('mechanica')
