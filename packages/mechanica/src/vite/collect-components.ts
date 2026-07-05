/**
 * Generate the `virtual:mechanica/components` module — the site's design-system
 * manifest (`src/composer.ts`, declared with `defineComposer`), exposed to every
 * runtime entry.
 *
 * Unlike blocks (a scanned directory) or composed blocks (baked JSON), the
 * manifest is a single ordinary user module importing real Vue SFCs. This module
 * re-exports:
 *  - `registerComponents(blocks)` — registers each object-form component into a
 *    runtime block set, so composed blocks that place them render everywhere.
 *  - `componentDefs` — editor-facing metadata for the composer palette (string
 *    entries, which re-expose a compiled block by id, carry a `ref`).
 *  - `classDefs` — the site's design-system CSS classes (normalized), offered as
 *    element **Style** in the composer. Only the composer entry imports these.
 *
 * When no manifest file exists it degrades to inert exports, so a site without a
 * design system still builds.
 */
export function generateComponentsModule(manifestSpecifier: string | null): string {
  if (!manifestSpecifier) {
    return [
      'export const registerComponents = (blocks) => blocks',
      'export const componentDefs = []',
      'export const classDefs = []',
      '',
    ].join('\n')
  }
  return [
    `import manifest from ${JSON.stringify(manifestSpecifier)}`,
    // From `mechanica` (not `mechanica-shared`): a virtual module can't resolve a
    // bare shared specifier in the source-aliased dev app, but `mechanica` is aliased.
    `import { normalizeClassManifest } from 'mechanica'`,
    ``,
    `/** The manifest's components record (the design-system components). */`,
    `const components = manifest.components ?? {}`,
    ``,
    `/** Register each object-form manifest component into a runtime block set (idempotent). */`,
    `export function registerComponents(blocks) {`,
    `  for (const id in components) {`,
    `    const entry = components[id]`,
    `    if (entry && typeof entry === 'object' && entry.component) blocks.set(id, entry.component)`,
    `  }`,
    `  return blocks`,
    `}`,
    ``,
    `/** Composer-palette metadata for every component; string entries carry a \`ref\` to a compiled block. */`,
    `export const componentDefs = Object.keys(components).map((id) => {`,
    `  const entry = components[id]`,
    `  return typeof entry === 'string'`,
    `    ? { id, ref: entry }`,
    `    : { id, name: entry.name, icon: entry.icon, props: entry.props, previewData: entry.previewData }`,
    `})`,
    ``,
    `/** The site's design-system classes, normalized for the composer's Style select. */`,
    `export const classDefs = normalizeClassManifest(manifest.classes)`,
    ``,
  ].join('\n')
}
