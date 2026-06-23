import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { resolveDevQuery } from './query-dev'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
  fs.writeFileSync(join(mechDir, 'pages', 'index.json'), JSON.stringify({ content: [], data: {}, name: 'Home' }))
  fs.writeFileSync(join(mechDir, 'pages', 'about.json'), JSON.stringify({ content: [], data: {}, name: 'About' }))
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('resolveDevQuery', () => {
  it('resolves getPages and strips ordering fields', () => {
    const result = resolveDevQuery(mechDir, 'getPages.' + JSON.stringify({})) as Record<string, unknown>[]
    expect(result.map((p) => p.path).sort()).toEqual(['/', '/about'])
    expect(result[0]).not.toHaveProperty('order')
    expect(result[0]).not.toHaveProperty('orderAfter')
    expect(result[0]).not.toHaveProperty('folderPath')
  })

  it('returns an empty object for unknown query types', () => {
    expect(resolveDevQuery(mechDir, 'unknown.{}')).toEqual({})
  })
})
