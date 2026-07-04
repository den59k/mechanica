import type { Component } from 'vue'
import type { ComposerComponentDefinition } from 'mechanica-shared'

/** A manifest entry with `component` narrowed to a real Vue component. */
export type ComposerComponentInput =
  | (Omit<ComposerComponentDefinition, 'component'> & { component: Component })
  | string

/**
 * Declare the site's design-system components as building material for the Block
 * Composer. An identity function that only adds types (the `defineWidget`
 * pattern): the manifest (default `src/composer.ts`) is collected into
 * `virtual:mechanica/components` and each `component` is registered into every
 * runtime block set — so a composed block that places one of these renders in
 * dev, SSR, static export and the preview/`shot` route with no extra wiring.
 *
 * A bare string value re-exposes an existing compiled block by id.
 */
export function defineComposerComponents<T extends Record<string, ComposerComponentInput>>(components: T): T {
  return components
}
