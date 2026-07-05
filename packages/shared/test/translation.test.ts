import { describe, it, expect } from 'vitest'
import {
  deepEqual,
  mergeValue,
  diffValue,
  mergeBlocks,
  diffBlocks,
  mergeTranslation,
  diffTranslation,
} from '@/translation'
import type { ContentBlock } from '@/types'

describe('deepEqual', () => {
  it('compares scalars, arrays and objects structurally', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual('a', 'b')).toBe(false)
    expect(deepEqual([1, 2], [1, 2])).toBe(true)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(true)
  })
})

describe('mergeValue', () => {
  it('inherits the base when the overlay is absent', () => {
    expect(mergeValue('base', undefined)).toBe('base')
  })

  it('replaces scalars and arrays wholesale', () => {
    expect(mergeValue('en', 'ru')).toBe('ru')
    expect(mergeValue([1, 2, 3], [9])).toEqual([9])
  })

  it('deep-merges objects so a translation can override one key', () => {
    expect(mergeValue({ src: '/a.png', alt: 'A car' }, { alt: 'Машина' })).toEqual({
      src: '/a.png',
      alt: 'Машина',
    })
  })
})

describe('diffValue', () => {
  it('collapses equal values to undefined (inherit)', () => {
    expect(diffValue('x', 'x')).toBeUndefined()
    expect(diffValue({ a: 1 }, { a: 1 })).toBeUndefined()
  })

  it('keeps only differing object keys', () => {
    expect(diffValue({ src: '/a.png', alt: 'A car' }, { src: '/a.png', alt: 'Машина' })).toEqual({
      alt: 'Машина',
    })
  })

  it('keeps arrays whole when changed', () => {
    expect(diffValue([1, 2], [1, 3])).toEqual([1, 3])
  })

  it('round-trips: merge(base, diff(base, full)) === full', () => {
    const base = { src: '/a.png', alt: 'A', tags: ['x', 'y'], n: 1 }
    const full = { src: '/a.png', alt: 'Б', tags: ['x', 'z'], n: 1 }
    expect(mergeValue(base, diffValue(base, full))).toEqual(full)
  })
})

const block = (id: string, blockId: string, data: Record<string, unknown>, children?: ContentBlock['children']): ContentBlock =>
  children ? { id, blockId, data, children } : { id, blockId, data }

describe('mergeBlocks / diffBlocks', () => {
  const base: ContentBlock[] = [
    block('hero', 'banner', { image: { src: '/car.png', width: 1024 }, heading: 'Hello' }),
    block('cta', 'cta-band', { title: 'Ship today', href: '#go' }),
  ]

  it('base owns structure; a sparse overlay only fills translated fields', () => {
    const overlay: ContentBlock[] = [block('hero', 'banner', { heading: 'Привет' })]
    const merged = mergeBlocks(base, overlay)
    // image (shared) inherited, heading (translated) overridden
    expect(merged[0]!.data).toEqual({ image: { src: '/car.png', width: 1024 }, heading: 'Привет' })
    // untouched block inherited whole
    expect(merged[1]!.data).toEqual({ title: 'Ship today', href: '#go' })
  })

  it('diff keeps only changed blocks and fields', () => {
    const full: ContentBlock[] = [
      block('hero', 'banner', { image: { src: '/car.png', width: 1024 }, heading: 'Привет' }),
      block('cta', 'cta-band', { title: 'Ship today', href: '#go' }),
    ]
    const sparse = diffBlocks(base, full)
    expect(sparse).toEqual([{ id: 'hero', blockId: 'banner', data: { heading: 'Привет' } }])
  })

  it('a block added to the base appears in every locale (untranslated)', () => {
    const overlay: ContentBlock[] = [block('hero', 'banner', { heading: 'Привет' })]
    const grown = [...base, block('extra', 'section', { title: 'New section' })]
    const merged = mergeBlocks(grown, overlay)
    expect(merged).toHaveLength(3)
    expect(merged[2]!.data).toEqual({ title: 'New section' })
  })

  it('drops overlay-only blocks (base owns structure)', () => {
    const full: ContentBlock[] = [
      block('hero', 'banner', { image: { src: '/car.png', width: 1024 }, heading: 'Привет' }),
      block('cta', 'cta-band', { title: 'Ship today', href: '#go' }),
      block('ghost', 'section', { title: 'Locale-only' }),
    ]
    expect(diffBlocks(base, full).map((b) => b.id)).toEqual(['hero'])
  })

  it('recurses into named slots', () => {
    const baseTree: ContentBlock[] = [
      block('card', 'card', { title: 'Card' }, { default: [block('q', 'testimonial', { quote: 'Great' })] }),
    ]
    const overlay: ContentBlock[] = [
      block('card', 'card', {}, { default: [block('q', 'testimonial', { quote: 'Отлично' })] }),
    ]
    const merged = mergeBlocks(baseTree, overlay)
    const child = (merged[0]!.children as Record<string, ContentBlock[]>).default![0]!
    expect(child.data).toEqual({ quote: 'Отлично' })
    // and the diff of that same full tree is sparse
    expect(diffBlocks(baseTree, mergeBlocks(baseTree, overlay))).toEqual([
      { id: 'card', blockId: 'card', data: {}, children: { default: [{ id: 'q', blockId: 'testimonial', data: { quote: 'Отлично' } }] } },
    ])
  })
})

describe('mergeTranslation / diffTranslation round-trip', () => {
  it('merge(base, diff(base, full)) reproduces the full doc', () => {
    const base = {
      content: [block('hero', 'banner', { image: { src: '/car.png' }, heading: 'Hi' })],
      data: { head: { title: 'Home', description: 'Desc' } },
      meta: { title: 'Home' },
    }
    const full = {
      content: [block('hero', 'banner', { image: { src: '/car.png' }, heading: 'Привет' })],
      data: { head: { title: 'Главная', description: 'Desc' } },
      meta: { title: 'Главная' },
    }
    const sparse = diffTranslation(base, full)
    // sparse carries only the translated bits
    expect(sparse.content).toEqual([{ id: 'hero', blockId: 'banner', data: { heading: 'Привет' } }])
    expect(sparse.data).toEqual({ head: { title: 'Главная' } })
    expect(sparse.meta).toEqual({ title: 'Главная' })
    // and merging it back reproduces the full doc
    expect(mergeTranslation(base, sparse)).toEqual(full)
  })

  it('an empty translation inherits the base entirely', () => {
    const base = { content: [block('hero', 'banner', { heading: 'Hi' })], data: { a: 1 }, meta: {} }
    expect(mergeTranslation(base, { content: [], data: {}, meta: {} })).toEqual({
      content: base.content,
      data: { a: 1 },
      meta: {},
    })
  })
})
