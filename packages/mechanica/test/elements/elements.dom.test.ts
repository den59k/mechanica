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
    // Visual style rides the variable indirection too (breakpoint-capable).
    expect(frame.style.getPropertyValue('--el-bg')).toBe('#fff')
    expect(frame.getAttribute('data-block-id')).toBe('f')
    const heading = el.querySelector('h1.mxel-text')
    expect(heading?.textContent).toBe('Hi')
  })

  it('text maps typography to CSS variables, with $bp overrides', () => {
    const el = mount({
      content: [
        {
          id: 't',
          blockId: 'mech:text',
          data: { content: 'Hi', size: 48, weight: 700, color: '#111', $bp: { sm: { size: 28 } } },
        },
      ],
      data: {},
    })
    const text = el.querySelector('.mxel-text') as HTMLElement
    expect(text.style.getPropertyValue('--el-fs')).toBe('48px')
    expect(text.style.getPropertyValue('--el-fw')).toBe('700')
    expect(text.style.getPropertyValue('--el-color')).toBe('#111')
    expect(text.style.getPropertyValue('--el-fs-sm')).toBe('28px')
    // No direct inline font-size — it would beat the media queries.
    expect(text.style.fontSize).toBe('')
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

  it('maps min/max limits to shared CSS variables on any element kind', () => {
    const el = mount({
      content: [
        {
          id: 'f',
          blockId: 'mech:frame',
          data: { minWidth: 120, maxWidth: 960, minHeight: 240, maxHeight: 600, $bp: { sm: { minHeight: 160 } } },
        },
      ],
      data: {},
    })
    const frame = el.querySelector('.mxel-frame') as HTMLElement
    expect(frame.style.getPropertyValue('--el-minw')).toBe('120px')
    expect(frame.style.getPropertyValue('--el-maxw')).toBe('960px')
    expect(frame.style.getPropertyValue('--el-minh')).toBe('240px')
    expect(frame.style.getPropertyValue('--el-maxh')).toBe('600px')
    expect(frame.style.getPropertyValue('--el-minh-sm')).toBe('160px')
  })

  it('appends a sanitized design-system class from `cls`, dropping bad tokens', () => {
    const el = mount({
      content: [
        { id: 'f', blockId: 'mech:frame', data: { cls: 'ds-container is-wide' } },
        { id: 't', blockId: 'mech:text', data: { content: 'x', cls: 'bad token! ok-2' } },
      ],
      data: {},
    })
    const frame = el.querySelector('.mxel-frame') as HTMLElement
    expect(frame.classList.contains('ds-container')).toBe(true)
    expect(frame.classList.contains('is-wide')).toBe(true)
    const text = el.querySelector('.mxel-text') as HTMLElement
    // "token!" is dropped (invalid); "ok-2" and "bad" survive.
    expect(text.classList.contains('ok-2')).toBe(true)
    expect(text.classList.contains('bad')).toBe(true)
    expect(text.className).not.toContain('token!')
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
