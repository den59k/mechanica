import { describe, it, expect } from 'vitest'
import { createApp } from 'vue'
import type { State } from 'mechanica-shared'
import { createMechanica } from '@/core/create-mechanica'
import { Content } from '@/core/content'

function mount(state: State) {
  const el = document.createElement('div')
  createApp(Content).use(createMechanica({ state, blocks: new Map() })).mount(el)
  return el
}

describe('element blocks', () => {
  it('frame maps layout to CSS variables and renders slot children', () => {
    const el = mount({
      content: [
        {
          id: 'f',
          blockId: 'mech:frame',
          data: { direction: 'row', gap: 16, background: '#fff' },
          children: [{ id: 't', blockId: 'mech:text', data: { tag: 'h1', content: 'Hi' } }],
        },
      ],
      data: {},
    })
    const frame = el.querySelector('.mxel-frame') as HTMLElement
    expect(frame).toBeTruthy()
    expect(frame.style.getPropertyValue('--el-dir')).toBe('row')
    expect(frame.style.getPropertyValue('--el-gap')).toBe('16px')
    expect(frame.style.background).toBe('rgb(255, 255, 255)')
    expect(frame.getAttribute('data-block-id')).toBe('f')
    const heading = el.querySelector('h1.mxel-text')
    expect(heading?.textContent).toBe('Hi')
  })

  it('frame emits breakpoint-suffixed variables from $bp', () => {
    const el = mount({
      content: [{ id: 'f', blockId: 'mech:frame', data: { direction: 'row', $bp: { sm: { direction: 'column' } } } }],
      data: {},
    })
    const frame = el.querySelector('.mxel-frame') as HTMLElement
    expect(frame.style.getPropertyValue('--el-dir')).toBe('row')
    expect(frame.style.getPropertyValue('--el-dir-sm')).toBe('column')
  })

  it('image renders a placeholder when src is empty, an <img> otherwise', () => {
    const empty = mount({ content: [{ id: 'i', blockId: 'mech:image', data: {} }], data: {} })
    expect(empty.querySelector('.mxel-image--empty')?.textContent).toBe('Image')

    const withSrc = mount({ content: [{ id: 'i', blockId: 'mech:image', data: { src: '/a.png', alt: 'A' } }], data: {} })
    const img = withSrc.querySelector('img.mxel-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/a.png')
    expect(img.getAttribute('alt')).toBe('A')
  })

  it('absolute placement produces position/inset style', () => {
    const el = mount({
      content: [{ id: 't', blockId: 'mech:text', data: { content: 'x', $abs: { anchor: 'top-right', x: 12, y: 8 } } }],
      data: {},
    })
    const node = el.querySelector('.mxel-text') as HTMLElement
    expect(node.style.position).toBe('absolute')
    expect(node.style.top).toBe('8px')
    expect(node.style.right).toBe('12px')
  })
})
