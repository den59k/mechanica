import { describe, it, expect } from 'vitest'
import {
  generateClientEntry,
  generateComposerEntry,
  generatePreviewEntry,
  generateSsrEntry,
} from '@/vite/entries'

describe('generateClientEntry', () => {
  it('mounts the user app from the factory', () => {
    const code = generateClientEntry({ userEntry: '/src/main.ts', mount: '#app', mode: 'dev' })
    expect(code).toContain('import definition from "/src/main.ts"')
    expect(code).toContain('import { blocksMap }')
    expect(code).toContain("import { registerComponents } from 'virtual:mechanica/components'")
    expect(code).toContain('registerComponents(blocksMap)')
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
    // Composed blocks expand into the compiled blocks their templates use.
    expect(code).toContain("import { composedList } from 'virtual:mechanica/composed'")
    expect(code).toContain('const composedMap = new Map(composedList.map((def) => [def.id, def]))')
    expect(code).toContain('loadBlocks(blockLoaders, state.content ?? [], undefined, composedMap).then((blocks) => {')
    expect(code).toContain('registerComponents(blocks)') // site components register into the runtime set
    // Loaders reach the runtime so SPA navigation can fetch missing chunks.
    expect(code).toContain('{ mode: "client", state, blocks, blockLoaders, composed: composedList }')
    expect(code).toContain('.mount("#app")')
  })

  it('eager mode passes composed definitions to the app', () => {
    const code = generateClientEntry({ userEntry: '/src/main.ts', mount: '#app', mode: 'client' })
    expect(code).toContain("import { composedList } from 'virtual:mechanica/composed'")
    expect(code).toContain('blocks: blocksMap, composed: composedList')
  })
})

describe('generatePreviewEntry', () => {
  it('imports the user app for side effects without mounting it', () => {
    const code = generatePreviewEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain('import "/src/main.ts"')
    expect(code).not.toContain('import definition')
    expect(code).not.toContain('.mount(')
    expect(code).toContain("import { mountPreviewApp, createComposedComponent } from 'mechanica'")
    // Composed blocks + site components are registered so /@mechanica/preview/<id> renders.
    expect(code).toContain('registerComponents(blocks)')
    expect(code).toContain('for (const def of composedList) blocks.set(def.id, createComposedComponent(def))')
    expect(code).toContain("mountPreviewApp({ blocks, target: '#app'")
    expect(code).toContain("fetch('/@mechanica/state?path=/')")
  })
})

describe('generateComposerEntry', () => {
  it('imports the user app, registers composed blocks + components, and mounts the composer', () => {
    const code = generateComposerEntry({ userEntry: '/src/main.ts', breakpoints: { md: 900, sm: 560 } })
    expect(code).toContain('import "/src/main.ts"')
    // The generated element CSS rides along so the canvas matches a real page.
    expect(code).toContain("import 'virtual:mechanica/elements.css'")
    expect(code).toContain("import { registerComponents, componentDefs, classDefs } from 'virtual:mechanica/components'")
    expect(code).toContain("import { mountComposerApp } from 'mechanica/composer'")
    expect(code).toContain('registerComponents(blocks)')
    expect(code).toContain('for (const def of composedList) blocks.set(def.id, createComposedComponent(def))')
    // Class defs + the statically-read breakpoints are threaded to the composer.
    expect(code).toContain('mountComposerApp({ blocks, components: componentDefs, classDefs, breakpoints: {"md":900,"sm":560}, target: \'#app\' })')
  })
})

describe('generateSsrEntry', () => {
  it('exposes blocksList, dataEntries and render', () => {
    const code = generateSsrEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain("export { blocksList } from 'virtual:mechanica/blocks'")
    expect(code).toContain('registerComponents(blocksMap)')
    expect(code).toContain('export const dataEntries = getDataEntries()')
    expect(code).toContain('export async function render(state, context = {})')
    expect(code).toContain('renderToString(app)')
  })

  it('collects the queries the render resolves and returns them with the html', () => {
    const code = generateSsrEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain('(query[key] = await context.resolveQuery(key))')
    expect(code).toContain('return { html, query }')
  })

  it('bakes the site identity in for the export CLI (empty object when unset)', () => {
    const bare = generateSsrEntry({ userEntry: '/src/main.ts' })
    expect(bare).toContain('export const site = {}')
    const configured = generateSsrEntry({
      userEntry: '/src/main.ts',
      site: { url: 'https://acme.test', name: 'Acme' },
    })
    expect(configured).toContain('export const site = {"url":"https://acme.test","name":"Acme"}')
  })
})
