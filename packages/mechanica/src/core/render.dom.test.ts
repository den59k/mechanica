import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h, type Component } from 'vue'
import type { State } from '@mechanica/shared'
import { createMechanica } from './create-mechanica'
import { Content } from './content'
import type { BlocksMap } from './state'

const Hero = defineComponent({
  props: { title: { type: String, default: '' } },
  setup: (props) => () => h('h1', props.title),
})

const Box = defineComponent({
  setup: (_, { slots }) => () => h('div', { class: 'box' }, slots.default?.()),
})

const blocks: BlocksMap = new Map<string, Component>([
  ['hero', Hero],
  ['box', Box],
])

function mount(state: State, map: BlocksMap = blocks) {
  const el = document.createElement('div')
  createApp(Content).use(createMechanica({ state, blocks: map })).mount(el)
  return el
}

describe('<Content> rendering', () => {
  it('renders a flat block tree with props', () => {
    const el = mount({
      content: [{ id: '1', blockId: 'hero', data: { title: 'Hello' } }],
      data: {},
    })
    expect(el.innerHTML).toContain('<h1>Hello</h1>')
  })

  it('renders nested blocks through default slots', () => {
    const el = mount({
      content: [
        {
          id: '1',
          blockId: 'box',
          data: {},
          children: [{ id: '2', blockId: 'hero', data: { title: 'Nested' } }],
        },
      ],
      data: {},
    })
    expect(el.querySelector('.box h1')?.textContent).toBe('Nested')
  })

  it('skips unknown block ids without throwing', () => {
    const el = mount({
      content: [
        { id: '1', blockId: 'hero', data: { title: 'Kept' } },
        { id: '2', blockId: 'ghost', data: {} },
      ],
      data: {},
    })
    expect(el.innerHTML).toContain('Kept')
    expect(el.innerHTML).not.toContain('ghost')
  })
})
