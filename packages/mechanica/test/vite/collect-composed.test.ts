import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadComposedDefinitions, collectComposed } from '@/vite/collect-composed'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mech-composed-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const write = (name: string, body: string) => writeFileSync(join(dir, name), body)

describe('loadComposedDefinitions', () => {
  it('parses every .block.yml, deriving id from the filename when omitted', () => {
    write('hero.block.yml', 'name: Hero\ntemplate:\n  - blockId: mech:text\n    data: { content: hi }')
    write('cta.block.yml', 'id: call-to-action\nname: CTA\ntemplate: []')
    const defs = loadComposedDefinitions(dir)
    expect(defs.map((d) => d.id).sort()).toEqual(['call-to-action', 'hero'])
    expect(defs.find((d) => d.name === 'Hero')?.template).toHaveLength(1)
  })

  it('skips a malformed file and reports it, keeping the rest', () => {
    write('good.block.yml', 'name: Good\ntemplate: []')
    write('bad.block.yml', 'name: [unclosed')
    const errors: string[] = []
    const defs = loadComposedDefinitions(dir, (file) => errors.push(file))
    expect(defs.map((d) => d.id)).toEqual(['good'])
    expect(errors).toHaveLength(1)
  })

  it('returns nothing for a missing directory', () => {
    expect(loadComposedDefinitions(join(dir, 'nope'))).toEqual([])
  })
})

describe('collectComposed', () => {
  it('emits a composedList module with the definitions baked in', () => {
    write('hero.block.yml', 'name: Hero\ntemplate: []')
    const code = collectComposed(dir)
    expect(code).toContain('export const composedList = ')
    expect(code).toContain('"id":"hero"')
    expect(code).toContain('"name":"Hero"')
  })
})
