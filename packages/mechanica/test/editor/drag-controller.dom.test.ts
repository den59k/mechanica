import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ContentBlock } from '@mechanica/shared'
import { createEditorStore, type EditorStore } from '@/editor/lib/store'
import { createDragController, type DragController } from '@/editor/lib/drag-controller'

// A default-slot container (Section), a named-slot container (Split), and a leaf.
const components = [
  { blockId: 'section', __name: 'Section', blockSchema: { name: 'Section', slots: { default: true } } },
  { blockId: 'split', __name: 'Split', blockSchema: { name: 'Split', slots: { start: true, end: true } } },
  { blockId: 'leaf', __name: 'Leaf', blockSchema: { name: 'Leaf' } },
]

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect
}

/** Stub `getBoundingClientRect` on a created element. */
function withRect(el: HTMLElement, r: DOMRect): HTMLElement {
  el.getBoundingClientRect = () => r
  return el
}

/** A live-page block element with a fixed geometry, mounted under `#app`. */
function pageBlock(id: string, r: DOMRect): HTMLElement {
  const el = withRect(document.createElement('div'), r)
  el.setAttribute('data-block-id', id)
  document.getElementById('app')!.appendChild(el)
  return el
}

let store: EditorStore
let controller: DragController
let blockId: string

beforeEach(() => {
  store = createEditorStore({ content: [], data: {} }, components)
  store.addBlock('section')
  blockId = store.content[0]!.id
  controller = createDragController(store)

  // A live-page block for the section, with a known geometry, so the controller
  // can project a logical drop onto the page.
  document.body.innerHTML = '<div id="app"></div>'
  pageBlock(blockId, rect(100, 10, 300, 80))
})

afterEach(() => {
  // Release the drag so its window listeners don't leak between tests.
  window.dispatchEvent(new Event('pointerup'))
  document.elementFromPoint = () => null
})

/** Begin a drag and move to (x, y); `target` is what sits under the pointer. */
function dragOver(target: HTMLElement, x: number, y: number) {
  // jsdom has no layout engine, so stub the hit-test the controller relies on.
  document.elementFromPoint = () => target
  controller.begin({ kind: 'new', blockId: 'leaf', label: 'Leaf' }, { clientX: 0, clientY: 0 } as PointerEvent)
  const move = new Event('pointermove')
  Object.assign(move, { clientX: x, clientY: y })
  window.dispatchEvent(move)
}

describe('drag controller — one logical drop, two projections', () => {
  it('a tree row middle-third nests into the default slot, and outlines the page block', () => {
    const row = withRect(document.createElement('div'), rect(40, 0, 200, 30))
    row.setAttribute('data-tree-id', blockId)
    document.body.appendChild(row)

    dragOver(row, 100, 55) // middle third (50..60) of a default-slot container

    expect(controller.drop).toEqual({ anchorId: blockId, position: 'inside', slot: 'default' })
    expect(controller.container).toEqual({ parentId: blockId, slot: 'default' })
    // A drop onto the block itself outlines the box; a pure inside drop has no line.
    expect(controller.domBox).toEqual({ top: 100, left: 10, width: 300, height: 80, label: undefined, outline: true })
    expect(controller.domLine).toBeNull()
  })

  it('a tree row top-third inserts before, projected as a line at the page block top', () => {
    const row = withRect(document.createElement('div'), rect(40, 0, 200, 30))
    row.setAttribute('data-tree-id', blockId)
    document.body.appendChild(row)

    dragOver(row, 100, 43) // top third → before

    expect(controller.drop).toEqual({ anchorId: blockId, position: 'before' })
    // A root-level sibling drop has no enclosing container — just the line.
    expect(controller.container).toBeNull()
    expect(controller.domBox).toBeNull()
    expect(controller.domLine).toEqual({ top: 100, left: 10, width: 300 })
  })

  it('a named-slot node targets that slot and labels the page box with the slot name', () => {
    const slot = withRect(document.createElement('div'), rect(60, 0, 200, 26))
    slot.setAttribute('data-tree-slot', `${blockId}:end`)
    document.body.appendChild(slot)

    dragOver(slot, 100, 70)

    expect(controller.drop).toEqual({ anchorId: blockId, position: 'inside', slot: 'end' })
    expect(controller.container).toEqual({ parentId: blockId, slot: 'end' })
    expect(controller.domBox).toMatchObject({ label: 'end', outline: true })
  })

  it('inserting before a child *inside* a slot highlights the parent container + the line', () => {
    // Put a leaf inside the section's default slot, with its own page geometry.
    store.addBlockAt('leaf', { anchorId: blockId, position: 'inside', slot: 'default' })
    const childId = (store.content[0]!.children as ContentBlock[])[0]!.id
    pageBlock(childId, rect(120, 20, 280, 30))

    const childRow = withRect(document.createElement('div'), rect(70, 0, 200, 30))
    childRow.setAttribute('data-tree-id', childId)
    document.body.appendChild(childRow)

    dragOver(childRow, 100, 73) // top third → before the child

    expect(controller.drop).toEqual({ anchorId: childId, position: 'before' })
    // The drop falls inside the section's default slot → fill that container (no
    // outline, since the pointer isn't over the block itself)…
    expect(controller.container).toEqual({ parentId: blockId, slot: 'default' })
    expect(controller.domBox).toEqual({ top: 100, left: 10, width: 300, height: 80, label: undefined, outline: false })
    // …while the line marks the exact position at the child's top edge.
    expect(controller.domLine).toEqual({ top: 120, left: 20, width: 280 })
  })

  it('dragging over the live page nests into a default-slot container (page → drop)', () => {
    const block = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement

    dragOver(block, 200, 140) // middle third of 100..180

    expect(controller.drop).toEqual({ anchorId: blockId, position: 'inside', slot: 'default' })
  })

  it('an empty page area appends to the root', () => {
    document.body.innerHTML = '' // no #app, no blocks
    const stray = document.createElement('div')
    document.body.appendChild(stray)

    dragOver(stray, 50, 50)

    expect(controller.drop).toEqual({ anchorId: null, position: 'after' })
    expect(controller.container).toBeNull()
  })
})
