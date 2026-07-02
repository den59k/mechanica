import { describe, it, expect } from 'vitest'
import { migrateContent, findUnknownBlocks } from '@/migrate'
import type { Block, ContentBlock } from '@/types'

const hero: Block = {
  id: 'hero',
  name: 'Hero',
  version: 2,
  migrate(data, from) {
    if (from < 2 && 'title' in data) {
      data.heading = data.title
      delete data.title
    }
  },
}
const plain: Block = { id: 'plain', name: 'Plain' }
const blocksMap = new Map([
  [hero.id, hero],
  [plain.id, plain],
])

describe('migrateContent', () => {
  it('upgrades old data and stamps the current version', () => {
    const content: ContentBlock[] = [{ id: '1', blockId: 'hero', data: { title: 'Hi' } }]
    expect(migrateContent(content, blocksMap)).toBe(true)
    expect(content[0]!.data).toEqual({ heading: 'Hi' })
    expect(content[0]!.v).toBe(2)
  })

  it('is a no-op for current data and unversioned blocks', () => {
    const content: ContentBlock[] = [
      { id: '1', blockId: 'hero', data: { heading: 'Hi' }, v: 2 },
      { id: '2', blockId: 'plain', data: { x: 1 } },
      { id: '3', blockId: 'gone', data: {} },
    ]
    expect(migrateContent(content, blocksMap)).toBe(false)
    expect(content[0]!.data).toEqual({ heading: 'Hi' })
    expect(content[1]!.v).toBeUndefined()
  })

  it('supports migrate returning a replacement object', () => {
    const replacing: Block = {
      id: 'r',
      name: 'R',
      version: 3,
      migrate: (data, from) => ({ wrapped: data, from }),
    }
    const content: ContentBlock[] = [{ id: '1', blockId: 'r', data: { a: 1 }, v: 2 }]
    migrateContent(content, new Map([[replacing.id, replacing]]))
    expect(content[0]!.data).toEqual({ wrapped: { a: 1 }, from: 2 })
    expect(content[0]!.v).toBe(3)
  })

  it('migrates nested slot children', () => {
    const content: ContentBlock[] = [
      {
        id: 'wrap',
        blockId: 'plain',
        data: {},
        children: { start: [{ id: 'in', blockId: 'hero', data: { title: 'Deep' } }] },
      },
    ]
    migrateContent(content, blocksMap)
    const inner = (content[0]!.children as Record<string, ContentBlock[]>).start![0]!
    expect(inner.data).toEqual({ heading: 'Deep' })
    expect(inner.v).toBe(2)
  })

  it('stamps versioned blocks even without a migrate hook', () => {
    const versioned: Block = { id: 'x', name: 'X', version: 2 }
    const content: ContentBlock[] = [{ id: '1', blockId: 'x', data: { a: 1 } }]
    expect(migrateContent(content, new Map([[versioned.id, versioned]]))).toBe(true)
    expect(content[0]!).toMatchObject({ data: { a: 1 }, v: 2 })
  })
})

describe('findUnknownBlocks', () => {
  it('reports block ids missing from the registry, deduplicated', () => {
    const content: ContentBlock[] = [
      { id: '1', blockId: 'hero', data: {} },
      { id: '2', blockId: 'gone', data: {} },
      { id: '3', blockId: 'gone', data: {}, children: [{ id: '4', blockId: 'also-gone', data: {} }] },
    ]
    expect(findUnknownBlocks(content, blocksMap).sort()).toEqual(['also-gone', 'gone'])
  })
})
