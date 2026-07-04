import { describe, it, expect } from 'vitest'
import type { VNode } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { renderBlocks } from '@/core/render-blocks'

// Component stubs — renderBlocks only needs map.get + h(); we inspect the
// returned vnode tree without mounting. Real objects (not strings) so Vue treats
// them as components and normalizes slots exactly as in production.
const Badge = { name: 'Badge', render: () => null }
const Frame = { name: 'Frame', render: () => null }
const map = new Map<string, any>([
  ['badge', Badge],
  ['mech:frame', Frame],
])

const render = (block: ContentBlock): VNode => renderBlocks([block], map as never)[0] as VNode

describe('renderBlocks: placement wrapper for non-element blocks', () => {
  it('wraps a component that carries a margin', () => {
    const v = render({ id: 'b1', blockId: 'badge', data: { text: 'Hi', margin: [8, 0] } })
    expect(v.type).toBe('div')
    expect((v.props as any).class).toBe('mxel mxel-slot')
    expect((v.props as any).style).toMatchObject({ '--el-margin': '8px 0px' })
    expect((v.props as any)['data-block-id']).toBe('b1') // the wrapper owns the mapping
    // the inner component keeps its real props but not the placement / mapping keys
    const inner = (v.children as VNode[])[0]!
    expect(inner.type).toBe(Badge)
    expect((inner.props as any).text).toBe('Hi')
    expect('margin' in (inner.props as any)).toBe(false)
    expect('data-block-id' in (inner.props as any)).toBe(false)
  })

  it('wraps a component that is absolutely placed ($abs)', () => {
    const v = render({ id: 'b2', blockId: 'badge', data: { $abs: { anchor: 'top-right', x: 12, y: 4 } } })
    expect(v.type).toBe('div')
    expect((v.props as any).style).toMatchObject({ position: 'absolute', right: '12px', top: '4px' })
    const inner = (v.children as VNode[])[0]!
    expect('$abs' in (inner.props as any)).toBe(false)
  })

  it('does NOT wrap a component with no placement data', () => {
    const v = render({ id: 'b3', blockId: 'badge', data: { text: 'Hi' } })
    expect(v.type).toBe(Badge)
    expect((v.props as any)['data-block-id']).toBe('b3')
  })

  it('never wraps a built-in element — it applies its own placement inline', () => {
    const v = render({ id: 'b4', blockId: 'mech:frame', data: { margin: 16, $abs: { anchor: 'top-left' } } })
    expect(v.type).toBe(Frame)
    expect((v.props as any)['data-block-id']).toBe('b4')
    expect((v.props as any).margin).toBe(16) // the element reads margin/$abs itself
  })

  it('carries the wrapped component slots through', () => {
    const v = render({ id: 'b5', blockId: 'badge', data: { margin: 4 }, children: [{ id: 'c1', blockId: 'badge', data: {} }] })
    expect(v.type).toBe('div')
    const inner = (v.children as VNode[])[0]!
    expect(inner.type).toBe(Badge)
    expect(typeof (inner.children as any).default).toBe('function')
  })
})
