import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { Block } from 'vuewrite'
import RichTextEditor from '@/editor/fields/richtext/RichTextEditor.vue'
import { clearRegisteredWidgets } from '@/editor/fields/richtext/widgets'
import { createContextMenu, contextMenuKey, type ContextMenuController } from '@/editor/lib/context-menu'

beforeEach(() => clearRegisteredWidgets())

async function mountEditor(blocks: Block[]) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const menu = createContextMenu()
  const app = createApp({
    render: () => h(RichTextEditor, { modelValue: blocks, toolbar: true }),
  })
  app.provide(contextMenuKey, menu)
  app.mount(el)
  // Let the post-mount flush run: it's what hands the outer editor ref down to
  // widgets (the table's history/delete integration) — as in a real browser.
  await nextTick()
  return { el, app, menu }
}

const rightClick = (target: Element): void => {
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
}

const blockEl = (el: HTMLElement, id: string): Element =>
  el.querySelector(`[data-vw-block-id="${id}"]`)!

const labels = (menu: ContextMenuController): string[] => menu.items.map((i) => i.label)

const run = (menu: ContextMenuController, label: string): void => {
  const item = menu.items.find((i) => i.label === label)
  expect(item, `menu item "${label}"`).toBeTruthy()
  expect(item!.disabled ?? false).toBe(false)
  menu.close()
  item!.onClick?.()
}

const tableBlock = (): Block =>
  ({
    id: 't1',
    text: '',
    type: 'table',
    editable: false,
    rows: [
      [{ text: 'Name' }, { text: 'Role' }],
      [{ text: 'Ada' }, { text: 'Engineer' }],
    ],
    // Seeded so vuewrite's shallow block copy shares this array with the test.
    align: [null, null],
  }) as Block

describe('RichTextEditor block context menu', () => {
  it('opens with structural actions on right-click of a block', async () => {
    const { el, app, menu } = await mountEditor([{ id: '1', text: 'Hello' }])
    rightClick(blockEl(el, '1'))
    expect(menu.open).toBe(true)
    expect(labels(menu)).toEqual([
      'Add paragraph above',
      'Add paragraph below',
      'Move up',
      'Move down',
      'Duplicate',
      'Delete block',
    ])
    // A single block can't move anywhere.
    expect(menu.items.find((i) => i.label === 'Move up')!.disabled).toBe(true)
    expect(menu.items.find((i) => i.label === 'Move down')!.disabled).toBe(true)
    app.unmount()
  })

  it('deletes an editable:false widget block', async () => {
    const { el, app, menu } = await mountEditor([
      { id: '1', text: 'Keep me' },
      { id: '2', text: '', type: 'img', editable: false, src: '' } as Block,
    ])
    expect(el.querySelector('.mech-rt-image')).toBeTruthy()
    rightClick(el.querySelector('.mech-rt-image')!) // inside the widget → resolves to its block
    run(menu, 'Delete block')
    await nextTick()
    expect(el.querySelector('.mech-rt-image')).toBeNull()
    expect(el.textContent).toContain('Keep me')
    app.unmount()
  })

  it('adds paragraphs around an editable:false widget block', async () => {
    const { el, app, menu } = await mountEditor([
      { id: '1', text: '', type: 'img', editable: false, src: '' } as Block,
    ])
    rightClick(blockEl(el, '1'))
    run(menu, 'Add paragraph below')
    await nextTick()
    await nextTick()
    rightClick(blockEl(el, '1'))
    run(menu, 'Add paragraph above')
    await nextTick()
    await nextTick()
    const blocks = [...el.querySelectorAll('[data-vw-block-id]')].filter(
      (b) => !b.parentElement?.closest('[data-vw-block-id]'), // top-level only
    )
    expect(blocks).toHaveLength(3)
    expect(blocks[1]!.querySelector('.mech-rt-image')).toBeTruthy() // widget in the middle
    app.unmount()
  })

  it('moves and duplicates blocks', async () => {
    const { el, app, menu } = await mountEditor([
      { id: '1', text: 'First' },
      { id: '2', text: 'Second' },
    ])
    rightClick(blockEl(el, '2'))
    run(menu, 'Move up')
    await nextTick()
    await nextTick()
    const order = [...el.querySelectorAll('[data-vw-block-id]')].map((b) => b.textContent?.trim())
    expect(order).toEqual(['Second', 'First'])

    rightClick(blockEl(el, '2'))
    run(menu, 'Duplicate')
    await nextTick()
    await nextTick()
    const texts = [...el.querySelectorAll('[data-vw-block-id]')].map((b) => b.textContent?.trim())
    expect(texts).toEqual(['Second', 'Second', 'First'])
    app.unmount()
  })

  it('keeps the native menu inside widget form controls', async () => {
    const { el, app, menu } = await mountEditor([
      { id: '1', text: 'code here', type: 'code', editable: false, lang: '' } as Block,
    ])
    const textarea = el.querySelector('textarea')!
    rightClick(textarea)
    expect(menu.open).toBe(false)
    app.unmount()
  })
})

describe('RichTableWidget cell context menu', () => {
  it('opens table actions instead of the block menu', async () => {
    const { el, app, menu } = await mountEditor([tableBlock()])
    rightClick(el.querySelector('td.vw-table-cell')!)
    expect(menu.open).toBe(true)
    expect(labels(menu)).toEqual([
      'Insert row above',
      'Insert row below',
      'Insert column left',
      'Insert column right',
      'Align left',
      'Align center',
      'Align right',
      'Delete row',
      'Delete column',
      'Delete table',
    ])
    app.unmount()
  })

  it('inserts and removes rows and columns at the clicked cell', async () => {
    const block = tableBlock()
    const { el, app, menu } = await mountEditor([block])
    const cell = () => el.querySelector('td.vw-table-cell')! // row 1, col 0

    rightClick(cell())
    run(menu, 'Insert row below')
    await nextTick()
    expect((block.rows as unknown[][]).length).toBe(3)

    rightClick(cell())
    run(menu, 'Insert column right')
    await nextTick()
    expect((block.rows as unknown[][])[0]).toHaveLength(3)

    rightClick(cell())
    run(menu, 'Delete column')
    await nextTick()
    expect((block.rows as unknown[][])[0]).toHaveLength(2)

    rightClick(cell())
    run(menu, 'Delete row')
    await nextTick()
    expect((block.rows as unknown[][]).length).toBe(2)
    app.unmount()
  })

  it('sets and toggles column alignment with a checked indicator', async () => {
    const block = tableBlock()
    const { el, app, menu } = await mountEditor([block])

    rightClick(el.querySelector('td.vw-table-cell')!)
    expect(menu.items.every((i) => !i.checked)).toBe(true)
    run(menu, 'Align center')
    await nextTick()
    expect((block.align as unknown[])[0]).toBe('center')

    rightClick(el.querySelector('td.vw-table-cell')!)
    expect(menu.items.find((i) => i.label === 'Align center')!.checked).toBe(true)
    run(menu, 'Align center') // re-picking the active alignment resets it
    await nextTick()
    expect((block.align as unknown[])[0]).toBeNull()
    app.unmount()
  })

  it('deletes the whole table', async () => {
    const { el, app, menu } = await mountEditor([{ id: '0', text: 'Intro' }, tableBlock()])
    rightClick(el.querySelector('th.vw-table-cell')!)
    run(menu, 'Delete table')
    await nextTick()
    expect(el.querySelector('.mech-rt-table')).toBeNull()
    expect(el.textContent).toContain('Intro')
    app.unmount()
  })
})
