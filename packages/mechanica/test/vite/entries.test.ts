import { describe, it, expect } from 'vitest'
import { generateClientEntry, generatePreviewEntry, generateSsrEntry } from '@/vite/entries'

describe('generateClientEntry', () => {
  it('mounts the user app from the factory', () => {
    const code = generateClientEntry({ userEntry: '/src/main.ts', mount: '#app', mode: 'dev' })
    expect(code).toContain('import definition from "/src/main.ts"')
    expect(code).toContain('import { blocksMap }')
    expect(code).toContain('createMechanicaApp(definition, { mode: "dev"')
    expect(code).toContain('.mount("#app")')
  })

  it('dev mode resolves queries live against the dev server', () => {
    const code = generateClientEntry({ userEntry: '/src/main.ts', mount: '#app', mode: 'dev' })
    expect(code).toContain("fetch('/@mechanica/query?' + params)")
    expect(code).toContain('state.page?.pagination?.page') // paginated variant slices
    expect(code).toContain(', resolveQuery })')
  })

  it('uses the given mount selector and mode, without a dev query resolver', () => {
    const code = generateClientEntry({ userEntry: '/x.ts', mount: '#root', mode: 'client' })
    expect(code).toContain('mode: "client"')
    expect(code).toContain('.mount("#root")')
    // Production clients read baked window.state.query — no live resolver.
    expect(code).not.toContain('resolveQuery')
  })

  it('lazy mode awaits the page blocks before mounting and passes the loaders on', () => {
    const code = generateClientEntry({ userEntry: '/src/main.ts', mount: '#app', mode: 'client', lazy: true })
    expect(code).toContain("import { blockLoaders } from 'virtual:mechanica/blocks'")
    expect(code).not.toContain('blocksMap') // nothing eager left
    expect(code).toContain('loadBlocks(blockLoaders, state.content ?? []).then((blocks) => {')
    // Loaders reach the runtime so SPA navigation can fetch missing chunks.
    expect(code).toContain('{ mode: "client", state, blocks, blockLoaders }')
    expect(code).toContain('.mount("#app")')
  })
})

describe('generatePreviewEntry', () => {
  it('imports the user app for side effects without mounting it', () => {
    const code = generatePreviewEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain('import "/src/main.ts"')
    expect(code).not.toContain('import definition')
    expect(code).not.toContain('.mount(')
    expect(code).toContain("import { mountPreviewApp } from 'mechanica'")
    expect(code).toContain("mountPreviewApp({ blocks: blocksMap, target: '#app'")
    expect(code).toContain("fetch('/@mechanica/state?path=/')")
  })
})

describe('generateSsrEntry', () => {
  it('exposes blocksList, dataEntries and render', () => {
    const code = generateSsrEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain("export { blocksList } from 'virtual:mechanica/blocks'")
    expect(code).toContain('export const dataEntries = getDataEntries()')
    expect(code).toContain('export async function render(state, context = {})')
    expect(code).toContain('renderToString(app)')
  })

  it('collects the queries the render resolves and returns them with the html', () => {
    const code = generateSsrEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain('(query[key] = await context.resolveQuery(key))')
    expect(code).toContain('return { html, query }')
  })
})
