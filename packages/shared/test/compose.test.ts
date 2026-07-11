import { describe, it, expect } from 'vitest'
import { resolveComposedTemplate, resolveBindings, lookupBinding, templateBlockIds, isBinding } from '@/compose'
import type { ComposedBlockDefinition } from '@/types'

const def = (template: ComposedBlockDefinition['template']): ComposedBlockDefinition => ({
  id: 'hero',
  name: 'Hero',
  template,
})

describe('compose: isBinding', () => {
  it('recognizes a binding object', () => {
    expect(isBinding({ $bind: 'title' })).toBe(true)
    expect(isBinding({ $bind: 'x', fallback: 'y' })).toBe(true)
  })
  it('rejects non-bindings', () => {
    expect(isBinding({ title: 'x' })).toBe(false)
    expect(isBinding({ $bind: 123 })).toBe(false)
    expect(isBinding('$bind')).toBe(false)
    expect(isBinding(null)).toBe(false)
    expect(isBinding([{ $bind: 'x' }])).toBe(false)
  })
})

describe('compose: resolveBindings', () => {
  it('substitutes bindings at any depth', () => {
    const props = { title: 'Hello', link: { url: '/x', title: 'Docs' } }
    expect(resolveBindings({ $bind: 'title' }, props)).toBe('Hello')
    expect(resolveBindings({ heading: { $bind: 'title' } }, props)).toEqual({ heading: 'Hello' })
    expect(resolveBindings([{ $bind: 'title' }, 'plain'], props)).toEqual(['Hello', 'plain'])
    // A whole-object binding resolves to the object value.
    expect(resolveBindings({ cta: { $bind: 'link' } }, props)).toEqual({ cta: props.link })
  })
  it('resolves an unknown binding to undefined', () => {
    expect(resolveBindings({ $bind: 'nope' }, {})).toBeUndefined()
  })
  it('clones — the result never aliases the template', () => {
    const template = { nested: { keep: 1 } }
    const out = resolveBindings(template, {}) as typeof template
    expect(out).toEqual(template)
    expect(out.nested).not.toBe(template.nested)
  })

  it('resolves dot-path bindings into object props', () => {
    const props = { cta: { url: '/x', title: 'Docs' } }
    expect(resolveBindings({ $bind: 'cta.title' }, props)).toBe('Docs')
    expect(resolveBindings({ $bind: 'cta.missing.deep' }, props)).toBeUndefined()
  })

  it('lookupBinding prefers an exact key over a dot path', () => {
    expect(lookupBinding('a.b', { 'a.b': 1, a: { b: 2 } })).toBe(1)
    expect(lookupBinding('a.b', { a: { b: 2 } })).toBe(2)
  })
})

describe('compose: resolveComposedTemplate', () => {
  it('substitutes props and namespaces ids under the instance', () => {
    const d = def([
      {
        id: 'frame',
        blockId: 'mech:frame',
        data: { direction: 'column' },
        children: [{ id: 'title', blockId: 'mech:text', data: { content: { $bind: 'heading' } } }],
      },
    ])
    const out = resolveComposedTemplate(d, { heading: 'Welcome' }, 'inst-1')
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('inst-1:frame')
    expect(out[0]!.data).toEqual({ direction: 'column' })
    const children = out[0]!.children as { id: string; data: Record<string, unknown> }[]
    expect(children[0]!.id).toBe('inst-1:frame/d:title')
    expect(children[0]!.data.content).toBe('Welcome')
  })

  it('two instances produce distinct ids', () => {
    const d = def([{ id: 'a', blockId: 'mech:text', data: {} }])
    const one = resolveComposedTemplate(d, {}, 'x')
    const two = resolveComposedTemplate(d, {}, 'y')
    expect(one[0]!.id).toBe('x:a')
    expect(two[0]!.id).toBe('y:a')
  })

  it('drops a node whose $if binding is falsy, keeps a truthy one', () => {
    const d = def([
      { id: 'shown', blockId: 'mech:text', data: { $if: { $bind: 'flag' }, content: 'hi' } },
      { id: 'hidden', blockId: 'mech:text', data: { $if: { $bind: 'other' }, content: 'bye' } },
    ])
    const out = resolveComposedTemplate(d, { flag: true, other: false }, 'i')
    expect(out.map((n) => n.id)).toEqual(['i:shown'])
    // `$if` is consumed, never passed through as data.
    expect(out[0]!.data).toEqual({ content: 'hi' })
  })

  it('falls back to index when a node has no id', () => {
    const d = def([{ blockId: 'mech:text', data: {} } as never])
    const out = resolveComposedTemplate(d, {}, 'i')
    expect(out[0]!.id).toBe('i:0')
  })

  it('resolves named-slot children', () => {
    const d = def([
      {
        id: 'wrap',
        blockId: 'mech:frame',
        data: {},
        children: { start: [{ id: 'c', blockId: 'mech:text', data: { content: { $bind: 't' } } }] },
      },
    ])
    const out = resolveComposedTemplate(d, { t: 'X' }, 'i')
    const slots = out[0]!.children as Record<string, { id: string; data: Record<string, unknown> }[]>
    expect(slots.start![0]!.id).toBe('i:wrap/start:c')
    expect(slots.start![0]!.data.content).toBe('X')
  })
})

describe('compose: $each repetition', () => {
  const card = (extra: Record<string, unknown> = {}) => ({
    id: 'card',
    blockId: 'mech:frame',
    data: { $each: 'items', ...extra },
    children: [
      { id: 'title', blockId: 'mech:text', data: { content: { $bind: '$item.title' } } },
    ],
  })

  it('repeats the node per array item, binding $item fields, with @i-suffixed ids', () => {
    const d = def([{ id: 'wrap', blockId: 'mech:frame', data: {}, children: [card()] }])
    const out = resolveComposedTemplate(d, { items: [{ title: 'A' }, { title: 'B' }] }, 'i')
    const cards = out[0]!.children as { id: string; data: Record<string, unknown>; children: unknown }[]
    expect(cards.map((c) => c.id)).toEqual(['i:wrap/d:card@0', 'i:wrap/d:card@1'])
    const titles = cards.map((c) => (c.children as { data: Record<string, unknown> }[])[0]!.data.content)
    expect(titles).toEqual(['A', 'B'])
    // `$each` is consumed, never passed through as data.
    expect(cards[0]!.data).toEqual({})
  })

  it('resolves $item (whole item), $index, and still sees outer props', () => {
    const d = def([
      {
        id: 'row',
        blockId: 'mech:text',
        data: { $each: 'items', content: { $bind: '$item' }, n: { $bind: '$index' }, brand: { $bind: 'brand' } },
      },
    ])
    const out = resolveComposedTemplate(d, { items: ['x', 'y'], brand: 'Acme' }, 'i')
    expect(out.map((n) => n.data)).toEqual([
      { content: 'x', n: 0, brand: 'Acme' },
      { content: 'y', n: 1, brand: 'Acme' },
    ])
  })

  it('renders nothing for a missing or non-array prop', () => {
    const d = def([card()])
    expect(resolveComposedTemplate(d, {}, 'i')).toEqual([])
    expect(resolveComposedTemplate(d, { items: 'nope' }, 'i')).toEqual([])
    expect(resolveComposedTemplate(d, { items: [] }, 'i')).toEqual([])
  })

  it('honors $if per item (a falsy item field drops that instance only)', () => {
    const d = def([card({ $if: { $bind: '$item.shown' } })])
    const out = resolveComposedTemplate(d, { items: [{ title: 'A', shown: true }, { title: 'B', shown: false }] }, 'i')
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('i:card@0')
  })

  it('nested $each: the inner $item shadows the outer', () => {
    const d = def([
      {
        id: 'group',
        blockId: 'mech:frame',
        data: { $each: 'groups' },
        children: [
          { id: 'tag', blockId: 'mech:text', data: { $each: '$item.tags', content: { $bind: '$item' } } },
        ],
      },
    ])
    const out = resolveComposedTemplate(d, { groups: [{ tags: ['a', 'b'] }, { tags: ['c'] }] }, 'i')
    const contents = out.flatMap((g) =>
      (g.children as { data: Record<string, unknown> }[]).map((t) => t.data.content),
    )
    expect(contents).toEqual(['a', 'b', 'c'])
  })
})

describe('compose: templateBlockIds', () => {
  it('collects every referenced block id including slot children', () => {
    const d = def([
      {
        id: 'f',
        blockId: 'mech:frame',
        data: {},
        children: {
          default: [{ id: 't', blockId: 'mech:text', data: {} }],
          aside: [{ id: 'r', blockId: 'rating', data: {} }],
        },
      },
    ])
    expect(templateBlockIds(d)).toEqual(new Set(['mech:frame', 'mech:text', 'rating']))
  })
})
