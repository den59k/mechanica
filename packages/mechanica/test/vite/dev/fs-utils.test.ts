import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic, markMutated, wasRecentlyMutated } from '@/vite/dev/fs-utils'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(os.tmpdir(), 'mech-fs-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('writeFileAtomic', () => {
  it('writes content, creating parent directories, and leaves no temp files', () => {
    const file = join(dir, 'nested', 'page.page.md')
    writeFileAtomic(file, 'hello')
    expect(fs.readFileSync(file, 'utf-8')).toBe('hello')
    expect(fs.readdirSync(join(dir, 'nested'))).toEqual(['page.page.md'])
  })

  it('replaces an existing file', () => {
    const file = join(dir, 'a.json')
    writeFileAtomic(file, 'one')
    writeFileAtomic(file, 'two')
    expect(fs.readFileSync(file, 'utf-8')).toBe('two')
  })

  it('registers the write as a self-mutation', () => {
    const file = join(dir, 'a.json')
    expect(wasRecentlyMutated(file)).toBe(false)
    writeFileAtomic(file, 'x')
    expect(wasRecentlyMutated(file)).toBe(true)
  })
})

describe('mutation registry', () => {
  it('matches across path-separator and case differences', () => {
    const file = join(dir, 'Pages', 'Index.page.md')
    markMutated(file)
    expect(wasRecentlyMutated(file.replace(/\\/g, '/'))).toBe(true)
    expect(wasRecentlyMutated(file.toLowerCase())).toBe(true)
  })

  it('expires after the window', () => {
    const file = join(dir, 'a.json')
    markMutated(file)
    expect(wasRecentlyMutated(file, 0)).toBe(false)
  })
})
