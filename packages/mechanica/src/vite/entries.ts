export interface ClientEntryOptions {
  /** Import specifier for the user's `defineMechanicaApp` module. */
  userEntry: string
  /** CSS selector to mount into. */
  mount: string
  /** Runtime mode for the generated entry. */
  mode: 'client' | 'dev'
  /**
   * Build-mode code splitting: the blocks module exposes `blockLoaders`
   * (dynamic imports) instead of an eager `blocksMap`, and the entry awaits
   * exactly the blocks the page uses before mounting — so hydration sees real
   * components while unused blocks stay in their own chunks, never downloaded.
   */
  lazy?: boolean
}

/**
 * Generate the client entry that mounts the user's app from their
 * `defineMechanicaApp` factory — replacing v1's regex rewriting of the user's
 * `createApp().mount()` with an explicit, generated entry.
 */
export function generateClientEntry(options: ClientEntryOptions): string {
  if (options.lazy) {
    return [
      `import definition from ${JSON.stringify(options.userEntry)}`,
      `import { blockLoaders } from 'virtual:mechanica/blocks'`,
      `import { createMechanicaApp, loadBlocks } from 'mechanica'`,
      ``,
      `const state = window.state ?? { content: [], data: {} }`,
      `loadBlocks(blockLoaders, state.content ?? []).then((blocks) => {`,
      `  createMechanicaApp(definition, { mode: ${JSON.stringify(options.mode)}, state, blocks, blockLoaders })`,
      `    .mount(${JSON.stringify(options.mount)})`,
      `})`,
      ``,
    ].join('\n')
  }

  // Dev resolves queries live against the dev server; the production client
  // reads the results baked into `window.state.query` instead.
  const resolveQuery =
    options.mode === 'dev'
      ? [
          `const resolveQuery = (key) => {`,
          `  const params = new URLSearchParams({ q: key })`,
          `  const page = state.page?.pagination?.page`,
          `  if (page) params.set('page', String(page))`,
          `  return fetch('/@mechanica/query?' + params).then((res) => res.json())`,
          `}`,
        ]
      : []

  return [
    `import definition from ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { createMechanicaApp } from 'mechanica'`,
    ``,
    `const state = window.state ?? { content: [], data: {} }`,
    ...resolveQuery,
    `createMechanicaApp(definition, { mode: ${JSON.stringify(options.mode)}, state, blocks: blocksMap${options.mode === 'dev' ? ', resolveQuery' : ''} })`,
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
 * and (later) the SAAS render service. `render` takes a query resolver in its
 * context and returns the resolved results alongside the HTML, so the caller
 * can bake them into the page for synchronous client hydration.
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
    `export async function render(state, context = {}) {`,
    `  const query = {}`,
    `  const resolveQuery = context.resolveQuery`,
    `    ? async (key) => (query[key] = await context.resolveQuery(key))`,
    `    : undefined`,
    `  const app = createMechanicaApp(definition, { ssr: true, mode: 'server', state, blocks: blocksMap, resolveQuery })`,
    `  const html = await renderToString(app)`,
    `  return { html, query }`,
    `}`,
    ``,
  ].join('\n')
}
