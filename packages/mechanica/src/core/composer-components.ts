import type { Component } from 'vue'
import type { ComposerComponentDefinition, ComposerManifest } from 'mechanica-shared'

/** A components-manifest entry with `component` narrowed to a real Vue component. */
export type ComposerComponentInput =
  | (Omit<ComposerComponentDefinition, 'component'> & { component: Component })
  | string

/** The `defineComposer` manifest, with each component's `component` narrowed to Vue. */
export interface ComposerInput extends Omit<ComposerManifest, 'components'> {
  /** The site's design-system components offered in the composer palette. */
  components?: Record<string, ComposerComponentInput>
}

/**
 * Declare the site's design system for the Block Composer — its components, its
 * CSS `classes` (offered as element **Style**), and its `breakpoints`. An
 * identity function that only adds types (the `defineWidget` pattern): the
 * manifest (default `src/composer.ts`) is collected into
 * `virtual:mechanica/components`. Each component is registered into every runtime
 * block set (so a composed block that places one renders in dev, SSR, static
 * export and the preview/`shot` route); classes feed the composer's Style select;
 * breakpoints are read statically by the plugin (numeric literals only) to size
 * the generated element CSS media queries and the composer's device switcher.
 *
 * A component's bare string value re-exposes an existing compiled block by id.
 * See COMPOSER-MANIFEST.md.
 */
export function defineComposer<T extends ComposerInput>(manifest: T): T {
  return manifest
}
