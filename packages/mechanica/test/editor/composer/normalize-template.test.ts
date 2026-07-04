import { describe, it, expect } from 'vitest'
import type { ContentBlock } from 'mechanica-shared'
import {
  normalizeTemplate,
  isRootTemplate,
  createRootFrame,
} from '@/editor/composer/lib/normalize-template'

const frame = (children: ContentBlock[] = []): ContentBlock => ({
  id: 'f',
  blockId: 'mech:frame',
  data: { direction: 'column' },
  children,
})
const text = (id = 't'): ContentBlock => ({ id, blockId: 'mech:text', data: { content: 'Hi' } })

describe('isRootTemplate', () => {
  it('is true only for a single frame node', () => {
    expect(isRootTemplate([frame()])).toBe(true)
    expect(isRootTemplate([text()])).toBe(false)
    expect(isRootTemplate([frame(), frame()])).toBe(false)
    expect(isRootTemplate([])).toBe(false)
  })
})

describe('normalizeTemplate', () => {
  it('passes a single-frame template through, ensuring a children array', () => {
    const out = normalizeTemplate([{ id: 'r', blockId: 'mech:frame', data: {} }])
    expect(out).toHaveLength(1)
    expect(out[0]!.blockId).toBe('mech:frame')
    expect(out[0]!.children).toEqual([])
  })

  it('wraps a bare leaf in a root column frame', () => {
    const out = normalizeTemplate([text('a')])
    expect(out).toHaveLength(1)
    expect(out[0]!.blockId).toBe('mech:frame')
    expect(out[0]!.data.direction).toBe('column')
    expect((out[0]!.children as ContentBlock[])[0]!.id).toBe('a')
  })

  it('wraps a legacy multi-root template, keeping order', () => {
    const out = normalizeTemplate([text('a'), text('b')])
    expect(out).toHaveLength(1)
    expect((out[0]!.children as ContentBlock[]).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('produces an empty root frame from an empty template', () => {
    const out = normalizeTemplate([])
    expect(out).toHaveLength(1)
    expect(out[0]!.children).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [text('a')]
    normalizeTemplate(input)
    expect(input).toHaveLength(1)
    expect(input[0]!.blockId).toBe('mech:text')
  })
})

describe('createRootFrame', () => {
  it('defaults to a padded column with the given children', () => {
    const root = createRootFrame([text('a')])
    expect(root).toMatchObject({ blockId: 'mech:frame', data: { direction: 'column', gap: 24, padding: [64, 24] } })
    expect((root.children as ContentBlock[])[0]!.id).toBe('a')
  })
})
