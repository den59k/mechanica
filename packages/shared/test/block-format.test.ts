import { describe, it, expect } from 'vitest'
import {
  parseComposedBlock,
  serializeComposedBlock,
  ComposedBlockParseError,
} from '@/block-format'
import type { ComposedBlockDefinition } from '@/types'

const sample: ComposedBlockDefinition = {
  id: 'hero-banner',
  name: 'Hero Banner',
  icon: 'hero',
  category: 'Site blocks',
  props: {
    title: { type: 'string', title: 'Title', default: 'Build faster' },
    image: { type: 'string', format: 'image', title: 'Image' },
  },
  previewData: { title: 'Build faster' },
  template: [
    {
      id: 'frame',
      blockId: 'mech:frame',
      data: { direction: 'column', gap: 24, padding: [64, 48], background: '#f6f6f4' },
      children: [
        { id: 'title', blockId: 'mech:text', data: { tag: 'h1', content: { $bind: 'title' } } },
        { id: 'img', blockId: 'mech:image', data: { src: { $bind: 'image' }, fit: 'cover', radius: 12 } },
      ],
    },
  ],
}

describe('block-format: round-trip', () => {
  it('survives serialize → parse', () => {
    const parsed = parseComposedBlock(serializeComposedBlock(sample))
    expect(parsed).toEqual(sample)
  })

  it('preserves $bind bindings verbatim', () => {
    const parsed = parseComposedBlock(serializeComposedBlock(sample))
    const frame = parsed.template[0]!
    const children = frame.children as { data: Record<string, unknown> }[]
    expect(children[0]!.data.content).toEqual({ $bind: 'title' })
  })

  it('drops empty optional sections but keeps required fields', () => {
    const minimal: ComposedBlockDefinition = { id: 'x', name: 'X', template: [] }
    const text = serializeComposedBlock(minimal)
    expect(text).not.toContain('props')
    expect(text).not.toContain('previewData')
    expect(parseComposedBlock(text)).toEqual(minimal)
  })

  it('round-trips the hidden flag, emitting it only when true', () => {
    const oneOff: ComposedBlockDefinition = { id: 'feedback-page', name: 'Feedback page', hidden: true, template: [] }
    const text = serializeComposedBlock(oneOff)
    expect(text).toContain('hidden: true')
    expect(parseComposedBlock(text).hidden).toBe(true)

    // Reusable blocks omit the key; a literal `hidden: false` parses as unset.
    expect(serializeComposedBlock(sample)).not.toContain('hidden')
    expect(parseComposedBlock(serializeComposedBlock(sample)).hidden).toBeUndefined()
    expect(parseComposedBlock('id: x\nname: X\nhidden: false\ntemplate: []').hidden).toBeUndefined()
  })
})

describe('block-format: validation', () => {
  it('throws on missing id / name', () => {
    expect(() => parseComposedBlock('name: X')).toThrow(ComposedBlockParseError)
    expect(() => parseComposedBlock('id: x')).toThrow(/missing "name"/)
  })
  it('throws on a non-list template', () => {
    expect(() => parseComposedBlock('id: x\nname: X\ntemplate: 5')).toThrow(/"template" must be a list/)
  })
  it('throws on a template node without blockId', () => {
    expect(() => parseComposedBlock('id: x\nname: X\ntemplate:\n  - data: {}')).toThrow(/missing "blockId"/)
  })
  it('throws on invalid YAML', () => {
    expect(() => parseComposedBlock('id: [unclosed')).toThrow(ComposedBlockParseError)
  })
  it('treats an empty document as an error (no id)', () => {
    expect(() => parseComposedBlock('')).toThrow(/missing "id"/)
  })
  it('validates nested slot children', () => {
    const yaml = 'id: x\nname: X\ntemplate:\n  - blockId: mech:frame\n    children:\n      main: 3'
    expect(() => parseComposedBlock(yaml)).toThrow(/slot "main" must be a list/)
  })
})
