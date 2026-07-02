import { createApp, createSSRApp, type App, type Component } from 'vue'
import type { State } from '@mechanica/shared'
import { createMechanica } from './create-mechanica'
import type { BlockLoaders } from './load-blocks'
import type { BlocksMap, MechanicaMode, QueryResolver } from './state'

export interface MechanicaAppDefinition {
  /** Root component of the site. */
  root: Component
  /** Optional hook to register extra Vue plugins (Pinia, i18n, …). */
  setup?: (app: App) => void
}

/**
 * Declare the site's app. An **imported function** used in the entry module; the
 * Mechanica plugin generates the client and SSR entries from it, so authors
 * never write `createApp().mount()` or branch on SSR themselves.
 *
 *   export default defineMechanicaApp({ root: App, setup: (app) => app.use(createPinia()) })
 */
export function defineMechanicaApp(definition: MechanicaAppDefinition): MechanicaAppDefinition {
  return definition
}

export interface CreateMechanicaAppOptions {
  ssr?: boolean
  mode?: MechanicaMode
  state?: State
  blocks?: BlocksMap
  blockLoaders?: BlockLoaders
  resolveQuery?: QueryResolver
}

/**
 * Instantiate a Vue app from a {@link MechanicaAppDefinition}. Used internally by
 * the generated client/SSR entries — not typically called by site authors.
 */
export function createMechanicaApp(
  definition: MechanicaAppDefinition,
  options: CreateMechanicaAppOptions = {},
): App {
  const app = (options.ssr ? createSSRApp : createApp)(definition.root)
  app.use(
    createMechanica({
      mode: options.mode ?? (options.ssr ? 'server' : 'client'),
      state: options.state,
      blocks: options.blocks,
      blockLoaders: options.blockLoaders,
      resolveQuery: options.resolveQuery,
    }),
  )
  definition.setup?.(app)
  return app
}
