export interface ClientEntryOptions {
  /** Import specifier for the user's `defineMechanicaApp` module. */
  userEntry: string
  /** CSS selector to mount into. */
  mount: string
  /** Runtime mode for the generated entry. */
  mode: 'client' | 'dev'
}

/**
 * Generate the client entry that mounts the user's app from their
 * `defineMechanicaApp` factory — replacing v1's regex rewriting of the user's
 * `createApp().mount()` with an explicit, generated entry.
 */
export function generateClientEntry(options: ClientEntryOptions): string {
  return [
    `import definition from ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { createMechanicaApp } from 'mechanica'`,
    ``,
    `const state = window.state ?? { content: [], data: {} }`,
    `createMechanicaApp(definition, { mode: ${JSON.stringify(options.mode)}, state, blocks: blocksMap })`,
    `  .mount(${JSON.stringify(options.mount)})`,
    ``,
  ].join('\n')
}

export interface PreviewEntryOptions {
  /** Import specifier for the user's `defineMechanicaApp` module. */
  userEntry: string
}

/**
 * Generate the standalone block-preview entry (`virtual:mechanica/preview`,
 * served by the `/@mechanica/preview/<blockId>` dev route). Imports the user's
 * app module for its side effects — global CSS, fonts, registered data entries
 * — without mounting the root component, then mounts the requested block alone.
 */
export function generatePreviewEntry(options: PreviewEntryOptions): string {
  return [
    `import ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { mountPreviewApp } from 'mechanica'`,
    ``,
    `// Site-scope data so blocks that read shared data (headers, footers) render`,
    `// with real values; a failed fetch degrades to empty data, never a crash.`,
    `const state = await fetch('/@mechanica/state?path=/')`,
    `  .then((res) => (res.ok ? res.json() : null))`,
    `  .catch(() => null)`,
    `mountPreviewApp({ blocks: blocksMap, target: '#app', data: state?.data ?? {} })`,
    ``,
  ].join('\n')
}

export interface SsrEntryOptions {
  userEntry: string
}

/**
 * Generate the SSR entry. Exposes the block list, data entries and a `render`
 * function over the page state — the contract consumed by `mechanica export`
 * and (later) the SAAS render service.
 */
export function generateSsrEntry(options: SsrEntryOptions): string {
  return [
    `import { renderToString } from 'vue/server-renderer'`,
    `import definition from ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { createMechanicaApp, getDataEntries } from 'mechanica'`,
    `export { blocksList } from 'virtual:mechanica/blocks'`,
    ``,
    `export const dataEntries = getDataEntries()`,
    ``,
    `export async function render(state) {`,
    `  const app = createMechanicaApp(definition, { ssr: true, mode: 'server', state, blocks: blocksMap })`,
    `  return await renderToString(app)`,
    `}`,
    ``,
  ].join('\n')
}
