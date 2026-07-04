/**
 * Generate the `virtual:mechanica/components` module — the site's design-system
 * components manifest (`src/composer.ts`, declared with
 * `defineComposerComponents`), exposed to every runtime entry.
 *
 * Unlike blocks (a scanned directory) or composed blocks (baked JSON), the
 * manifest is a single ordinary user module importing real Vue SFCs. This module
 * re-exports:
 *  - `registerComponents(blocks)` — registers each object-form component into a
 *    runtime block set, so composed blocks that place them render everywhere.
 *  - `componentDefs` — editor-facing metadata for the composer palette (string
 *    entries, which re-expose a compiled block by id, carry a `ref`).
 *
 * When no manifest file exists it degrades to inert exports, so a site without a
 * design system still builds.
 */
export function generateComponentsModule(manifestSpecifier: string | null): string {
  if (!manifestSpecifier) {
    return ['export const registerComponents = (blocks) => blocks', 'export const componentDefs = []', ''].join('\n')
  }
  return [
    `import manifest from ${JSON.stringify(manifestSpecifier)}`,
    ``,
    `/** Register each object-form manifest component into a runtime block set (idempotent). */`,
    `export function registerComponents(blocks) {`,
    `  for (const id in manifest) {`,
    `    const entry = manifest[id]`,
    `    if (entry && typeof entry === 'object' && entry.component) blocks.set(id, entry.component)`,
    `  }`,
    `  return blocks`,
    `}`,
    ``,
    `/** Composer-palette metadata for every entry; string entries carry a \`ref\` to a compiled block. */`,
    `export const componentDefs = Object.keys(manifest).map((id) => {`,
    `  const entry = manifest[id]`,
    `  return typeof entry === 'string'`,
    `    ? { id, ref: entry }`,
    `    : { id, name: entry.name, icon: entry.icon, props: entry.props, previewData: entry.previewData }`,
    `})`,
    ``,
  ].join('\n')
}
