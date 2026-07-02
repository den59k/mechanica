import { describe, it, expect, beforeAll } from 'vitest'
import { registerFieldSchemas } from '@/fields'
import {
  getDefaultValue,
  passDefaultValue,
  buildPreviewData,
  mergePreviewData,
  walkTree,
  walkSchema,
} from '@/schema'
import type { ContentBlock } from '@/types'

// Register field defaults once so format-based defaults resolve. The alias
// registrar is a no-op here — these tests exercise the default map only.
beforeAll(() => registerFieldSchemas(() => {}))

describe('getDefaultValue', () => {
  it('handles primitive types', () => {
    expect(getDefaultValue({ type: 'string' })).toBe('')
    expect(getDefaultValue({ type: 'number' })).toBe(0)
    expect(getDefaultValue({ type: 'integer' })).toBe(0)
    expect(getDefaultValue({ type: 'boolean' })).toBe(false)
    expect(getDefaultValue({ type: 'array' })).toEqual([])
  })

  it('honors an explicit default, including falsy values', () => {
    expect(getDefaultValue({ type: 'string', default: 'hi' })).toBe('hi')
    expect(getDefaultValue({ type: 'number', default: 0 })).toBe(0)
    expect(getDefaultValue({ type: 'boolean', default: false })).toBe(false)
  })

  it('uses the field registry for formats', () => {
    expect(getDefaultValue({ type: 'array', format: 'richText' })).toEqual([{ text: '' }])
    expect(getDefaultValue({ type: 'object', format: 'file' })).toEqual({ src: '' })
  })

  it('fills required object properties and leaves optional ones undefined', () => {
    const value = getDefaultValue({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
      required: ['a'],
    })
    expect(value).toEqual({ a: '', b: undefined })
  })
})

describe('mergePreviewData', () => {
  it('deep-merges plain objects and replaces arrays and scalars', () => {
    expect(
      mergePreviewData(
        { a: 1, nested: { x: 1, y: 2 }, list: [1, 2] },
        { nested: { y: 3 }, list: [9] },
      ),
    ).toEqual({ a: 1, nested: { x: 1, y: 3 }, list: [9] })
  })

  it('does not mutate its inputs', () => {
    const base = { nested: { x: 1 } }
    mergePreviewData(base, { nested: { x: 2 } })
    expect(base.nested.x).toBe(1)
  })
})

describe('buildPreviewData', () => {
  const props = {
    type: 'object',
    properties: { title: { type: 'string' }, count: { type: 'number' } },
    required: ['title', 'count'],
  }

  it('layers overrides over previewData over schema defaults', () => {
    expect(buildPreviewData(props)).toEqual({ title: '', count: 0 })
    expect(buildPreviewData(props, { title: 'Hello' })).toEqual({ title: 'Hello', count: 0 })
    expect(buildPreviewData(props, { title: 'Hello' }, { count: 5 })).toEqual({
      title: 'Hello',
      count: 5,
    })
    expect(buildPreviewData(props, { title: 'Hello' }, { title: 'Override' })).toEqual({
      title: 'Override',
      count: 0,
    })
  })

  it('works without a props schema', () => {
    expect(buildPreviewData(undefined, { title: 'Hi' })).toEqual({ title: 'Hi' })
  })
})

describe('passDefaultValue', () => {
  it('returns a default when state is missing', () => {
    expect(passDefaultValue(undefined, { type: 'string' })).toBe('')
  })

  it('keeps existing values and fills missing required ones', () => {
    const out = passDefaultValue(
      { a: 'x' },
      { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a', 'b'] },
    )
    expect(out.a).toBe('x')
    expect(out.b).toBe('')
  })
})

describe('walkTree', () => {
  it('visits nested blocks in array and named-slot children', () => {
    const tree: ContentBlock[] = [
      { id: '1', blockId: 'a', data: {}, children: [{ id: '2', blockId: 'b', data: {} }] },
      { id: '3', blockId: 'c', data: {}, children: { footer: [{ id: '4', blockId: 'd', data: {} }] } },
    ]
    const seen: string[] = []
    walkTree(tree, (b) => seen.push(b.id))
    expect(seen).toEqual(['1', '2', '3', '4'])
  })
})

describe('walkSchema', () => {
  it('visits object properties and array items recursively', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: {
          type: 'array',
          items: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
        },
      },
      required: ['title', 'items'],
    }
    const obj = { title: 'hi', items: [{ x: '1' }, { x: '2' }] }
    const keys: (string | undefined)[] = []
    walkSchema(obj, schema, (_v, _s, key) => keys.push(key))
    expect(keys).toContain('title')
    expect(keys).toContain('items')
    expect(keys).toContain('x')
  })
})
