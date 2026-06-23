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
