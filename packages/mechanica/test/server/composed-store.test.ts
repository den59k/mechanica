import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import type { ComposedBlockDefinition } from 'mechanica-shared'
import {
  listComposedBlocks,
  readComposedBlock,
  createComposedBlock,
  saveComposedBlock,
  deleteComposedBlock,
  composedVersion,
  composedDirOf,
  ComposedBlockExistsError,
} from '@/server/composed-store'

let mechDir: string
beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

const def = (id: string, name = id): ComposedBlockDefinition => ({
  id,
  name,
  template: [{ id: 't', blockId: 'mech:text', data: { content: 'hi' } }],
})

describe('composed-store: create / read', () => {
  it('creates a block file and reads it back with a version', () => {
    const { version } = createComposedBlock(mechDir, def('hero', 'Hero'))
    expect(version).toMatch(/^[0-9a-f]{16}$/)
    expect(fs.existsSync(join(composedDirOf(mechDir), 'hero.block.yml'))).toBe(true)

    const read = readComposedBlock(mechDir, 'hero')
    expect(read?.def.name).toBe('Hero')
    expect(read?.def.template).toHaveLength(1)
    expect(read?.version).toBe(version)
  })

  it('throws when creating over an existing id', () => {
    createComposedBlock(mechDir, def('hero'))
    expect(() => createComposedBlock(mechDir, def('hero'))).toThrow(ComposedBlockExistsError)
  })

  it('reads null for a missing block', () => {
    expect(readComposedBlock(mechDir, 'nope')).toBeNull()
    expect(composedVersion(mechDir, 'nope')).toBeNull()
  })
})

describe('composed-store: save / version', () => {
  it('overwrites and bumps the version on change', () => {
    const { version: v1 } = createComposedBlock(mechDir, def('hero', 'Hero'))
    const { version: v2 } = saveComposedBlock(mechDir, 'hero', def('hero', 'Hero 2'))
    expect(v2).not.toBe(v1)
    expect(readComposedBlock(mechDir, 'hero')?.def.name).toBe('Hero 2')
  })

  it('forces the id to match the filename', () => {
    createComposedBlock(mechDir, def('hero'))
    saveComposedBlock(mechDir, 'hero', { ...def('mismatch'), name: 'Kept' })
    // The file is still hero.block.yml, and its id is normalized to the target.
    expect(readComposedBlock(mechDir, 'hero')?.def.id).toBe('hero')
    expect(fs.existsSync(join(composedDirOf(mechDir), 'mismatch.block.yml'))).toBe(false)
  })
})

describe('composed-store: list / delete', () => {
  it('lists summaries and deletes', () => {
    createComposedBlock(mechDir, { ...def('a', 'Alpha'), icon: 'star' })
    createComposedBlock(mechDir, def('b', 'Beta'))
    expect(listComposedBlocks(mechDir)).toEqual([
      { id: 'a', name: 'Alpha', icon: 'star', category: undefined },
      { id: 'b', name: 'Beta', icon: undefined, category: undefined },
    ])

    expect(deleteComposedBlock(mechDir, 'a')).toBe(true)
    expect(deleteComposedBlock(mechDir, 'a')).toBe(false)
    expect(listComposedBlocks(mechDir).map((b) => b.id)).toEqual(['b'])
  })

  it('returns an empty list when the directory does not exist', () => {
    expect(listComposedBlocks(mechDir)).toEqual([])
  })
})
