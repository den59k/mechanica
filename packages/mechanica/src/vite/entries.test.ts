import { describe, it, expect } from 'vitest'
import { generateClientEntry, generateSsrEntry } from './entries'

describe('generateClientEntry', () => {
  it('mounts the user app from the factory', () => {
    const code = generateClientEntry({ userEntry: '/src/main.ts', mount: '#app', mode: 'dev' })
    expect(code).toContain('import definition from "/src/main.ts"')
    expect(code).toContain('import { blocksMap }')
    expect(code).toContain('createMechanicaApp(definition, { mode: "dev"')
    expect(code).toContain('.mount("#app")')
  })

  it('uses the given mount selector and mode', () => {
    const code = generateClientEntry({ userEntry: '/x.ts', mount: '#root', mode: 'client' })
    expect(code).toContain('mode: "client"')
    expect(code).toContain('.mount("#root")')
  })
})

describe('generateSsrEntry', () => {
  it('exposes blocksList, dataEntries and render', () => {
    const code = generateSsrEntry({ userEntry: '/src/main.ts' })
    expect(code).toContain("export { blocksList } from 'virtual:mechanica/blocks'")
    expect(code).toContain('export const dataEntries = getDataEntries()')
    expect(code).toContain('export async function render(state)')
    expect(code).toContain('renderToString(app)')
  })
})
