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
      `import 'virtual:mechanica/elements.css'`,
      `import definition from ${JSON.stringify(options.userEntry)}`,
      `import { blockLoaders } from 'virtual:mechanica/blocks'`,
      `import { composedList } from 'virtual:mechanica/composed'`,
      `import { registerComponents } from 'virtual:mechanica/components'`,
      `import { createMechanicaApp, loadBlocks } from 'mechanica'`,
      ``,
      `const state = window.state ?? { content: [], data: {} }`,
      // Expand placed composed blocks into the compiled blocks their templates
      // use, so those chunks load before mounting (no missing-block flash).
      `const composedMap = new Map(composedList.map((def) => [def.id, def]))`,
      `loadBlocks(blockLoaders, state.content ?? [], undefined, composedMap).then((blocks) => {`,
      `  registerComponents(blocks)`,
      `  createMechanicaApp(definition, { mode: ${JSON.stringify(options.mode)}, state, blocks, blockLoaders, composed: composedList })`,
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
    `import 'virtual:mechanica/elements.css'`,
    `import definition from ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { composedList } from 'virtual:mechanica/composed'`,
    `import { registerComponents } from 'virtual:mechanica/components'`,
    `import { createMechanicaApp } from 'mechanica'`,
    ``,
    `const state = window.state ?? { content: [], data: {} }`,
    `registerComponents(blocksMap)`,
    ...resolveQuery,
    `createMechanicaApp(definition, { mode: ${JSON.stringify(options.mode)}, state, blocks: blocksMap, composed: composedList${options.mode === 'dev' ? ', resolveQuery' : ''} })`,
    `  .mount(${JSON.stringify(options.mount)})`,
    ``,
  ].join('\n')
}

export interface ComposerEntryOptions {
  /** Import specifier for the user's `defineMechanicaApp` module. */
  userEntry: string
  /** The site's element breakpoints — statically read from the manifest, injected
   *  as literals so the composer's device switcher matches the generated CSS. */
  breakpoints: { md: number; sm: number }
}

/**
 * Generate the Block Composer entry (`virtual:mechanica/composer`, served by the
 * `/@mechanica/composer/<blockId>` dev route). Imports the user's app module for
 * its side effects (global CSS, fonts, registered data) — same trick as the
 * preview entry — then mounts the composer over the real block set, composed
 * blocks included, so the canvas renders exactly what a page would. The site's
 * design-system classes (`classDefs`) feed the Style select; the breakpoints size
 * the device switcher to match the generated element CSS.
 */
export function generateComposerEntry(options: ComposerEntryOptions): string {
  return [
    `import 'virtual:mechanica/elements.css'`,
    `import ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { composedList } from 'virtual:mechanica/composed'`,
    `import { registerComponents, componentDefs, classDefs } from 'virtual:mechanica/components'`,
    `import { createComposedComponent } from 'mechanica'`,
    `import { mountComposerApp } from 'mechanica/composer'`,
    ``,
    `const blocks = new Map(blocksMap)`,
    `registerComponents(blocks)`,
    `for (const def of composedList) blocks.set(def.id, createComposedComponent(def))`,
    `mountComposerApp({ blocks, components: componentDefs, classDefs, breakpoints: ${JSON.stringify(options.breakpoints)}, target: '#app' })`,
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
    `import 'virtual:mechanica/elements.css'`,
    `import ${JSON.stringify(options.userEntry)}`,
    `import { blocksMap } from 'virtual:mechanica/blocks'`,
    `import { composedList } from 'virtual:mechanica/composed'`,
    `import { registerComponents } from 'virtual:mechanica/components'`,
    `import { mountPreviewApp, createComposedComponent } from 'mechanica'`,
    ``,
    `// Composed blocks preview too — register them (and the site components they`,
    `// use) so /@mechanica/preview/<id> and \`mechanica shot <id>\` render standalone.`,
    `const blocks = new Map(blocksMap)`,
    `registerComponents(blocks)`,
    `for (const def of composedList) blocks.set(def.id, createComposedComponent(def))`,
    ``,
    `// Site-scope data so blocks that read shared data (headers, footers) render`,
    `// with real values; a failed fetch degrades to empty data, never a crash.`,
    `const state = await fetch('/@mechanica/state?path=/')`,
    `  .then((res) => (res.ok ? res.json() : null))`,
    `  .catch(() => null)`,
    `mountPreviewApp({ blocks, target: '#app', data: state?.data ?? {} })`,
    ``,
  ].join('\n')
}

export interface SsrEntryOptions {
  userEntry: string
  /** Site identity (origin, name) from the plugin options — rides the bundle so
   *  `mechanica export` can emit canonical URLs, sitemap.xml and robots.txt. */
  site?: { url?: string; name?: string }
  /** The site's locale config (multi-language) — rides the bundle so the export
   *  can walk translations, and gets baked into each page's `state.locales`. */
  locales?: import('mechanica-shared').LocalesConfig | null
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
    `import { composedList } from 'virtual:mechanica/composed'`,
    `import { registerComponents } from 'virtual:mechanica/components'`,
    `import { createMechanicaApp, getDataEntries } from 'mechanica'`,
    `export { blocksList } from 'virtual:mechanica/blocks'`,
    `export { composedList } from 'virtual:mechanica/composed'`,
    ``,
    `registerComponents(blocksMap)`,
    `export const site = ${JSON.stringify(options.site ?? {})}`,
    `export const locales = ${JSON.stringify(options.locales ?? null)}`,
    `export const dataEntries = getDataEntries()`,
    ``,
    `export async function render(state, context = {}) {`,
    `  const query = {}`,
    `  const resolveQuery = context.resolveQuery`,
    `    ? async (key) => (query[key] = await context.resolveQuery(key))`,
    `    : undefined`,
    `  const app = createMechanicaApp(definition, { ssr: true, mode: 'server', state, blocks: blocksMap, composed: composedList, resolveQuery })`,
    `  const html = await renderToString(app)`,
    `  return { html, query }`,
    `}`,
    ``,
  ].join('\n')
}
