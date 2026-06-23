import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { collectBlocks } from '@/vite/collect-blocks'

const blocksDir = join(import.meta.dirname, '../fixtures/blocks')

describe('collectBlocks', () => {
  it('generates a module importing every defineBlock SFC', async () => {
    const code = await collectBlocks(blocksDir, async (id) => ({ id }))

    expect(code).toContain('export const blocksList = [')
    expect(code).toContain('export const blocksMap = new Map(')

    const importCount = (code.match(/^import block\d+ from /gm) ?? []).length
    expect(importCount).toBe(6) // all six fixtures use defineBlock
  })

  it('skips files that resolve to nothing', async () => {
    const code = await collectBlocks(blocksDir, async () => null)
    expect(code).toContain('export const blocksList = []')
  })

  it('returns an empty list for a missing directory', async () => {
    const code = await collectBlocks(join(blocksDir, 'does-not-exist'), async (id) => ({ id }))
    expect(code).toContain('export const blocksList = []')
  })
})
