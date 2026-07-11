import { describe, it, expect } from 'vitest'
import type { ContentBlock } from 'mechanica-shared'
import { effectiveData, resolveForCanvas, templateNodeId } from '@/editor/composer/lib/canvas'

const frame = (): ContentBlock => ({
  id: 'f',
  blockId: 'mech:frame',
  data: { direction: 'row', gap: 24, $bp: { md: { gap: 16 }, sm: { direction: 'column', gap: 12 } } },
  children: [{ id: 't', blockId: 'mech:text', data: { content: { $bind: 'title' }, $if: { $bind: 'flag' } } }],
})

describe('effectiveData', () => {
  it('returns base values with control keys stripped', () => {
    expect(effectiveData(frame(), 'base')).toEqual({ direction: 'row', gap: 24 })
  })
  it('cascades md then sm overrides', () => {
    expect(effectiveData(frame(), 'md')).toEqual({ direction: 'row', gap: 16 })
    expect(effectiveData(frame(), 'sm')).toEqual({ direction: 'column', gap: 12 })
  })
})

describe('resolveForCanvas', () => {
  it('resolves bindings, keeps ids, and keeps $if-hidden nodes visible', () => {
    const out = resolveForCanvas([frame()], 'base', { title: 'Hello', flag: false })
    expect(out[0]!.id).toBe('f')
    const child = (out[0]!.children as ContentBlock[])[0]!
    // Original id preserved (canvas click maps straight back to the node).
    expect(child.id).toBe('t')
    // Binding resolved for display…
    expect(child.data.content).toBe('Hello')
    // …and the $if node is still present (the designer must be able to edit it).
    expect(child.data.$if).toBeUndefined()
  })

  it('applies the breakpoint to nested nodes', () => {
    const out = resolveForCanvas([frame()], 'sm', {})
    expect(out[0]!.data).toEqual({ direction: 'column', gap: 12 })
  })

  it('expands a $each node per preview item — first keeps the id, ghosts get @i', () => {
    const repeat: ContentBlock = {
      id: 'card',
      blockId: 'mech:frame',
      data: { $each: 'items', gap: 8 },
      children: [{ id: 't', blockId: 'mech:text', data: { content: { $bind: '$item.title' } } }],
    }
    const out = resolveForCanvas([repeat], 'base', { items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] })
    expect(out.map((n) => n.id)).toEqual(['card', 'card@1', 'card@2'])
    // `$each` is consumed; the layout knobs stay.
    expect(out[0]!.data).toEqual({ gap: 8 })
    const titles = out.map((n) => (n.children as ContentBlock[])[0]!.data.content)
    expect(titles).toEqual(['A', 'B', 'C'])
  })

  it('still renders one editable instance when the items prop is missing/empty', () => {
    const repeat: ContentBlock = { id: 'card', blockId: 'mech:text', data: { $each: 'items', content: { $bind: '$item.t' } } }
    const out = resolveForCanvas([repeat], 'base', {})
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('card')
  })
})

describe('templateNodeId', () => {
  it('strips a repeat ghost suffix, leaves real ids alone', () => {
    expect(templateNodeId('card@2')).toBe('card')
    expect(templateNodeId('b3f2-a1@10')).toBe('b3f2-a1')
    expect(templateNodeId('card')).toBe('card')
    expect(templateNodeId('card@x')).toBe('card@x') // not a numeric suffix
  })
})
