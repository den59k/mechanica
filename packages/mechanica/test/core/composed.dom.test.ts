import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h, type Component } from 'vue'
import type { ComposedBlockDefinition, State } from 'mechanica-shared'
import { createMechanica } from '@/core/create-mechanica'
import { Content } from '@/core/content'
import type { BlocksMap } from '@/core/state'

const hero: ComposedBlockDefinition = {
  id: 'hero',
  name: 'Hero',
  props: { heading: 'string' },
  template: [
    {
      id: 'frame',
      blockId: 'mech:frame',
      data: { direction: 'column' },
      children: [
        { id: 'title', blockId: 'mech:text', data: { tag: 'h1', content: { $bind: 'heading' } } },
        { id: 'badge', blockId: 'mech:text', data: { $if: { $bind: 'showBadge' }, content: 'NEW' } },
      ],
    },
  ],
}

function mount(state: State, composed = [hero], blocks: BlocksMap = new Map()) {
  const el = document.createElement('div')
  createApp(Content).use(createMechanica({ state, blocks, composed })).mount(el)
  return el
}

describe('composed block rendering', () => {
  it('resolves bindings and namespaces node ids under the instance', () => {
    const el = mount({
      content: [{ id: 'p1', blockId: 'hero', data: { heading: 'Welcome', showBadge: false } }],
      data: {},
    })
    const title = el.querySelector('h1.mxel-text') as HTMLElement
    expect(title.textContent).toBe('Welcome')
    expect(title.getAttribute('data-block-id')).toBe('p1:frame/d:title')
    // $if false drops the badge node.
    expect(el.textContent).not.toContain('NEW')
  })

  it('keeps a $if-true node', () => {
    const el = mount({
      content: [{ id: 'p1', blockId: 'hero', data: { heading: 'Hi', showBadge: true } }],
      data: {},
    })
    expect(el.textContent).toContain('NEW')
  })

  it('renders two placements with distinct ids', () => {
    const el = mount({
      content: [
        { id: 'a', blockId: 'hero', data: { heading: 'One' } },
        { id: 'b', blockId: 'hero', data: { heading: 'Two' } },
      ],
      data: {},
    })
    const ids = [...el.querySelectorAll('h1.mxel-text')].map((n) => n.getAttribute('data-block-id'))
    expect(ids).toEqual(['a:frame/d:title', 'b:frame/d:title'])
  })

  it('renders a compiled block referenced inside the template', () => {
    const Rating = defineComponent({
      props: { stars: { type: Number, default: 0 } },
      setup: (props) => () => h('div', { class: 'rating' }, `★${props.stars}`),
    })
    const withRating: ComposedBlockDefinition = {
      id: 'card',
      name: 'Card',
      template: [{ id: 'r', blockId: 'rating', data: { stars: 5 } }],
    }
    const blocks: BlocksMap = new Map<string, Component>([['rating', Rating]])
    const el = mount(
      { content: [{ id: 'c', blockId: 'card', data: {} }], data: {} },
      [withRating],
      blocks,
    )
    expect(el.querySelector('.rating')?.textContent).toBe('★5')
  })
})
