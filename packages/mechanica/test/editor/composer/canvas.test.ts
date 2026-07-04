import { describe, it, expect } from 'vitest'
import type { ContentBlock } from 'mechanica-shared'
import { effectiveData, resolveForCanvas } from '@/editor/composer/lib/canvas'

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
})
