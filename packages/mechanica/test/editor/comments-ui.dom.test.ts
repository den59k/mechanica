import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp, h, nextTick, type App, type Component } from 'vue'
import type { CommentThread, NewCommentRequest } from 'mechanica-shared'
import { createEditorStore, editorStoreKey, type EditorStore } from '@/editor/lib/store'
import {
  commentOnClick,
  commentsKey,
  createCommentsStore,
  describeElement,
  ELEMENT_TEXT_LIMIT,
  type CommentsStore,
} from '@/editor/lib/comments'
import { createEditorBackend, setEditorBackend, type EditorBackend } from '@/editor/lib/backend'
import { registerFieldSchemas } from 'mechanica-shared'
import { registerBuiltinFieldEditors } from '@/editor/fields/builtin'
import { clearFieldEditors } from '@/editor/fields/registry'
import EditorApp from '@/editor/EditorApp.vue'
import CommentsPanel from '@/editor/components/CommentsPanel.vue'
import CommentThreadCard from '@/editor/components/CommentThreadCard.vue'
import CommentPins from '@/editor/components/CommentPins.vue'

const components = [
  { blockId: 'hero', __name: 'Hero', blockSchema: { name: 'Hero banner', category: 'Content', props: { title: 'string' } } },
  { blockId: 'pricing', __name: 'Pricing', blockSchema: { name: 'Pricing table', category: 'Content', props: {} } },
]

const pageContent = [
  { id: 'b1', blockId: 'hero', data: {} },
  { id: 'b2', blockId: 'pricing', data: {} },
]

const at = '2026-11-14T10:00:00.000Z'

const pinned: CommentThread = {
  id: 'c1',
  page: '/pricing',
  status: 'open',
  createdAt: at,
  anchor: { blockId: 'b2', blockType: 'pricing', path: [1], x: 0.5, y: 0.5, viewport: 390, quote: '$29 / month' },
  messages: [
    { id: 'm1', author: { name: 'Den Petrov', kind: 'user' }, body: 'Too tight\n<b>on mobile</b>', createdAt: at },
    { id: 'm2', author: { name: 'Claude', kind: 'agent' }, body: 'Widened the gap to 24px.', createdAt: at },
  ],
}
const pageLevel: CommentThread = {
  id: 'c2',
  page: '/pricing',
  status: 'open',
  createdAt: '2026-11-13T10:00:00.000Z',
  messages: [{ id: 'm3', author: { name: 'Anna', kind: 'user' }, body: 'Overall: great', createdAt: at }],
}
const orphan: CommentThread = {
  id: 'c3',
  page: '/pricing',
  status: 'open',
  createdAt: '2026-11-12T10:00:00.000Z',
  anchor: { blockId: 'gone', blockType: 'testimonials', path: [7] },
  messages: [{ id: 'm4', author: { name: 'Anna', kind: 'user' }, body: 'Wrong logo', createdAt: at }],
}
const resolved: CommentThread = {
  id: 'c4',
  page: '/pricing',
  status: 'resolved',
  createdAt: '2026-11-11T10:00:00.000Z',
  resolvedBy: { name: 'Claude', kind: 'agent' },
  anchor: { blockId: 'b1', blockType: 'hero', path: [0] },
  messages: [{ id: 'm5', author: { name: 'Den Petrov', kind: 'user' }, body: 'Typo in the title', createdAt: at }],
}

function fakeBackend(threads: CommentThread[]) {
  const comments = {
    list: vi.fn(async () => threads),
    create: vi.fn(
      async (input: NewCommentRequest): Promise<CommentThread> => ({
        id: 'new',
        page: input.page,
        anchor: input.anchor,
        status: 'open',
        createdAt: at,
        messages: [{ id: 'n1', author: { name: 'Den Petrov', kind: 'user' }, body: input.body, createdAt: at }],
      }),
    ),
    reply: vi.fn(async (id: string, body: string): Promise<CommentThread> => {
      const thread = threads.find((entry) => entry.id === id)!
      return {
        ...thread,
        messages: [...thread.messages, { id: 'r1', author: { name: 'Den Petrov', kind: 'user' }, body, createdAt: at }],
      }
    }),
    setStatus: vi.fn(
      async (id: string, status: 'open' | 'resolved'): Promise<CommentThread> => ({
        ...threads.find((entry) => entry.id === id)!,
        status,
      }),
    ),
    remove: vi.fn(async () => true),
  }
  const backend: Pick<EditorBackend, 'comments' | 'onCommentsChange'> = { comments, onCommentsChange: () => () => {} }
  return { backend, comments }
}

const apps: App[] = []
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function setup(threads: CommentThread[] = [pinned, pageLevel, orphan, resolved]) {
  const fake = fakeBackend(threads)
  const store = createEditorStore({ content: pageContent, data: {} }, components)
  const comments = createCommentsStore(fake.backend, { pollMs: 0 })
  await comments.load('/pricing')
  comments.toggleMode()
  return { ...fake, store, comments }
}

function mount(component: Component, store: EditorStore, comments: CommentsStore, props: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(component, props) })
  app.provide(editorStoreKey, store)
  app.provide(commentsKey, comments)
  app.mount(el)
  apps.push(app)
  return el
}

const click = (element: Element | null) => element!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve))
  await nextTick()
}

/** Put the page's blocks in the document, each with a fixed box. */
function renderBlocks() {
  const boxes: Record<string, { top: number; left: number; width: number; height: number }> = {
    b1: { top: 0, left: 300, width: 800, height: 400 },
    b2: { top: 400, left: 300, width: 800, height: 200 },
  }
  for (const [id, box] of Object.entries(boxes)) {
    const section = document.createElement('section')
    section.setAttribute('data-block-id', id)
    section.innerHTML = `<p id="text-${id}">Some text</p>`
    section.getBoundingClientRect = () => box as DOMRect
    section.scrollIntoView = vi.fn()
    document.body.appendChild(section)
  }
}

describe('CommentsPanel', () => {
  it('lists the page threads: open first, with where each one is', async () => {
    const { store, comments } = await setup()
    const el = mount(CommentsPanel, store, comments)

    expect(el.querySelector('.mech-comments__count')!.textContent).toBe('3')
    const rows = [...el.querySelectorAll('.mech-comments__row')]
    expect(rows.map((row) => row.getAttribute('data-thread-id'))).toEqual(['c1', 'c2', 'c3'])
    expect(rows[0]!.querySelector('.mech-comments__place')!.textContent).toBe('Pricing table')
    expect(rows[0]!.textContent).toContain('1 reply')
    expect(rows[0]!.querySelector('.mech-comment-avatar')!.textContent).toBe('DP')
    expect(rows[1]!.querySelector('.mech-comments__place')!.textContent).toBe('Whole page')
    expect(rows[1]!.textContent).not.toContain('repl')
    expect(rows[2]!.querySelector('.mech-comments__place')!.textContent).toBe('Block removed')
    expect(el.textContent).not.toContain('Click anywhere on the page')

    // Resolved threads join the list on request.
    expect(el.textContent).toContain('Show resolved (1)')
    const toggle = el.querySelector('input[type="checkbox"]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    await nextTick()
    expect(comments.showResolved).toBe(true)
    const last = [...el.querySelectorAll('.mech-comments__row')].at(-1)!
    expect(last.getAttribute('data-thread-id')).toBe('c4')
    expect(last.classList.contains('is-resolved')).toBe(true)
  })

  it('renders comment text as text, never as markup', async () => {
    const { store, comments } = await setup()
    const el = mount(CommentsPanel, store, comments)
    const text = el.querySelector('[data-thread-id="c1"] .mech-comments__text')!
    expect(text.textContent).toBe('Too tight\n<b>on mobile</b>')
    expect(text.querySelector('b')).toBeNull()
  })

  it('shows the hint when there is nothing to list, and the store error', async () => {
    const { store, comments } = await setup([])
    const el = mount(CommentsPanel, store, comments)
    expect(el.textContent).toContain('Click anywhere on the page to leave a comment.')
    expect(el.querySelector('.mech-comments__count')).toBeNull()
    expect(el.querySelector('.mech-comments__error')).toBeNull()

    comments.error = 'Reply failed (500)'
    await nextTick()
    expect(el.querySelector('.mech-comments__error')!.textContent).toBe('Reply failed (500)')
  })

  it('hover frames a row block; a click scrolls to it and opens the thread', async () => {
    const { store, comments } = await setup()
    renderBlocks()
    const el = mount(CommentsPanel, store, comments)
    const row = el.querySelector('[data-thread-id="c1"]')!

    row.dispatchEvent(new MouseEvent('mouseenter'))
    expect(store.hoverId).toBe('b2')
    row.dispatchEvent(new MouseEvent('mouseleave'))
    expect(store.hoverId).toBeNull()

    click(row)
    await nextTick()
    const block = document.querySelector('[data-block-id="b2"]')!
    expect(block.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(comments.activeId).toBe('c1')
    expect(row.classList.contains('is-active')).toBe(true)

    // A thread without a block just opens.
    click(el.querySelector('[data-thread-id="c2"]'))
    expect(comments.activeId).toBe('c2')
  })

  it('starts a page-level draft and leaves the mode from its header', async () => {
    const { store, comments } = await setup()
    const el = mount(CommentsPanel, store, comments)

    click(el.querySelector('.mech-comments__page'))
    expect(comments.draft).toEqual({ anchor: null })

    click(el.querySelector('.mech-editor__heading .mech-icon-button'))
    expect(comments.mode).toBe(false)
    expect(comments.draft).toBeNull()
  })

  it('copies the agent prompt for the page', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { store, comments } = await setup()
    const el = mount(CommentsPanel, store, comments)
    const button = el.querySelector('.mech-comments__copy')!
    expect(button.textContent).toContain('Copy for Claude')

    click(button)
    await settle()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]![0]).toContain('npx mechanica comments --page /pricing')
    expect(button.textContent).toContain('Copied')
  })
})

describe('CommentThreadCard', () => {
  const cardProps = (thread: CommentThread | null, place = 'Pricing table') => ({ thread, point: null, place })

  it('renders the messages, the quote, the agent tag and the viewport hint', async () => {
    const { store, comments } = await setup()
    const el = mount(CommentThreadCard, store, comments, cardProps(pinned))

    expect(el.querySelector('.mech-comment-card__place')!.textContent).toBe('Pricing table')
    expect(el.querySelector('.mech-comment-card__quote')!.textContent).toBe('$29 / month')
    // jsdom's viewport is not 390px wide.
    expect(el.querySelector('.mech-comment-card__hint')!.textContent).toBe('at 390px')

    const messages = [...el.querySelectorAll('.mech-comment-card__message')]
    expect(messages).toHaveLength(2)
    expect(messages[0]!.querySelector('.mech-comment-card__author')!.textContent).toBe('Den Petrov')
    expect(messages[0]!.querySelector('.mech-comment-card__tag')).toBeNull()
    expect(messages[1]!.querySelector('.mech-comment-card__tag')!.textContent).toBe('AI')
    expect(messages[1]!.querySelector('.mech-comment-avatar')!.classList.contains('is-agent')).toBe(true)
    // Not docked beside a pin: no inline position.
    expect(el.querySelector('.mech-comment-card')!.classList.contains('is-docked')).toBe(true)
  })

  it('escapes message text and keeps its line breaks', async () => {
    const { store, comments } = await setup()
    const el = mount(CommentThreadCard, store, comments, cardProps(pinned))
    const body = el.querySelector('.mech-comment-card__body')!
    expect(body.textContent).toBe('Too tight\n<b>on mobile</b>')
    expect(body.querySelector('b')).toBeNull()
    expect(body.innerHTML).toContain('&lt;b&gt;')
  })

  it('resolve and reopen go through the store', async () => {
    const { store, comments, comments: state, backend } = await setup()
    comments.showResolved = true
    const el = mount(CommentThreadCard, store, comments, cardProps(pinned))

    const resolve = el.querySelector('[data-action="resolve"]')!
    expect(resolve.classList.contains('is-primary')).toBe(true)
    expect(el.querySelector('[data-action="reopen"]')).toBeNull()
    click(resolve)
    await settle()
    expect(backend.comments.setStatus).toHaveBeenCalledWith('c1', 'resolved')
    expect(state.threads.find((thread) => thread.id === 'c1')!.status).toBe('resolved')

    // A resolved thread offers "Reopen" (quiet, not the black primary) and says who resolved it.
    const done = mount(CommentThreadCard, store, comments, cardProps(resolved, 'Hero banner'))
    const reopen = done.querySelector('[data-action="reopen"]')!
    expect(reopen.classList.contains('is-primary')).toBe(false)
    expect(done.textContent).toContain('Resolved by Claude')
    click(reopen)
    await settle()
    expect(backend.comments.setStatus).toHaveBeenLastCalledWith('c4', 'open')
  })

  it('Enter sends a reply, Shift+Enter does not', async () => {
    const { store, comments, backend } = await setup()
    const el = mount(CommentThreadCard, store, comments, cardProps(pinned))
    const input = el.querySelector('textarea')!
    expect(el.querySelector('[data-action="reply"]')).toBeNull()

    input.value = 'Looks good now'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(el.querySelector('[data-action="reply"]')).not.toBeNull()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true }))
    await settle()
    expect(backend.comments.reply).not.toHaveBeenCalled()

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    input.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    await settle()
    expect(backend.comments.reply).toHaveBeenCalledWith('c1', 'Looks good now')
    expect(input.value).toBe('')
    expect(comments.threads.find((thread) => thread.id === 'c1')!.messages).toHaveLength(3)
  })

  it('deletes only after an inline confirmation', async () => {
    const { store, comments, backend } = await setup()
    const el = mount(CommentThreadCard, store, comments, cardProps(pinned))

    click(el.querySelector('[data-action="delete"]'))
    await nextTick()
    expect(el.textContent).toContain('Delete this thread?')
    click(el.querySelector('[data-action="delete-no"]'))
    await nextTick()
    expect(backend.comments.remove).not.toHaveBeenCalled()
    expect(el.querySelector('[data-action="resolve"]')).not.toBeNull()

    click(el.querySelector('[data-action="delete"]'))
    await nextTick()
    click(el.querySelector('[data-action="delete-yes"]'))
    await settle()
    expect(backend.comments.remove).toHaveBeenCalledWith('c1')
    expect(comments.threads.some((thread) => thread.id === 'c1')).toBe(false)
  })

  it('the new-comment form posts the draft and hands over to the new thread', async () => {
    const { store, comments, backend } = await setup([])
    comments.startDraft(null)
    const el = mount(CommentThreadCard, store, comments, cardProps(null, 'Whole page'))
    const input = el.querySelector('textarea')!
    expect(document.activeElement).toBe(input)
    const submit = el.querySelector('[data-action="comment"]') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(el.querySelector('.mech-comment-card__messages')).toBeNull()

    input.value = 'Overall: great'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(submit.disabled).toBe(false)
    click(submit)
    await settle()
    expect(backend.comments.create).toHaveBeenCalledWith({ page: '/pricing', body: 'Overall: great' })
    expect(comments.draft).toBeNull()
    expect(comments.activeId).toBe('new')
  })

  it('Cancel drops the draft; the close button closes a thread', async () => {
    const { store, comments } = await setup()
    comments.startDraft(null)
    const form = mount(CommentThreadCard, store, comments, cardProps(null, 'Whole page'))
    click(form.querySelector('[data-action="cancel"]'))
    expect(comments.draft).toBeNull()

    comments.openThread('c1')
    const card = mount(CommentThreadCard, store, comments, cardProps(pinned))
    click(card.querySelector('.mech-comment-card__head .mech-icon-button'))
    expect(comments.activeId).toBeNull()
  })
})

describe('CommentPins', () => {
  it('pins each visible thread over its block and opens the thread on click', async () => {
    const { store, comments } = await setup()
    renderBlocks()
    const el = mount(CommentPins, store, comments)

    expect(el.querySelector('.mech-comment-layer')!.hasAttribute('data-mech-ui')).toBe(true)
    expect(document.documentElement.classList.contains('mech-commenting')).toBe(true)

    // Only the pinned, open thread: page-level, orphaned and resolved ones have no pin.
    const pins = [...el.querySelectorAll<HTMLElement>('.mech-comment-pin')]
    expect(pins.map((pin) => pin.getAttribute('data-thread-id'))).toEqual(['c1'])
    expect(pins[0]!.textContent!.trim()).toBe('D')
    // Half-way into b2's box (left 300 + 400, top 400 + 100).
    expect(pins[0]!.style.getPropertyValue('--pin-x')).toBe('700px')
    expect(pins[0]!.style.getPropertyValue('--pin-y')).toBe('500px')
    expect(el.querySelector('.mech-comment-card')).toBeNull()

    click(pins[0]!)
    await nextTick()
    expect(comments.activeId).toBe('c1')
    expect(pins[0]!.classList.contains('is-active')).toBe(true)
    const card = el.querySelector<HTMLElement>('.mech-comment-card')!
    expect(card.classList.contains('is-docked')).toBe(false)
    expect(card.style.transform).toContain('translate(')
    expect(card.textContent).toContain('Pricing table')

    // Clicking the open pin again closes it.
    click(pins[0]!)
    await nextTick()
    expect(comments.activeId).toBeNull()
    expect(el.querySelector('.mech-comment-card')).toBeNull()
  })

  it('shows resolved pins muted, and docks a thread without a block', async () => {
    const { store, comments } = await setup()
    renderBlocks()
    comments.showResolved = true
    const el = mount(CommentPins, store, comments)

    const muted = el.querySelector<HTMLElement>('[data-thread-id="c4"]')!
    expect(muted.classList.contains('is-resolved')).toBe(true)
    // No click point: just inside the top-right corner of b1 (300 + 800 - 16, 0 + 16).
    expect(muted.style.getPropertyValue('--pin-x')).toBe('1084px')
    expect(muted.style.getPropertyValue('--pin-y')).toBe('16px')

    comments.openThread('c3')
    await nextTick()
    const card = el.querySelector('.mech-comment-card')!
    expect(card.classList.contains('is-docked')).toBe(true)
    expect(card.querySelector('.mech-comment-card__place')!.textContent).toBe('Block removed')
  })

  it('a click on the page drafts a comment at that point, with its form beside the pin', async () => {
    const { store, comments, backend } = await setup([])
    renderBlocks()
    // jsdom has no layout: give the viewport a width for the anchor to record.
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1280, configurable: true })
    const el = mount(CommentPins, store, comments)

    // 25% across and half-way down b1.
    expect(commentOnClick(comments, store.content, 'b1', { clientX: 500, clientY: 200 })).toBe(true)
    await nextTick()
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
    expect(comments.draft!.anchor).toMatchObject({
      blockId: 'b1',
      blockType: 'hero',
      path: [0],
      x: 0.25,
      y: 0.5,
      viewport: 1280,
    })

    const draftPin = el.querySelector<HTMLElement>('.mech-comment-pin.is-draft')!
    expect(draftPin.style.getPropertyValue('--pin-x')).toBe('500px')
    expect(draftPin.style.getPropertyValue('--pin-y')).toBe('200px')
    const input = el.querySelector('.mech-comment-card textarea') as HTMLTextAreaElement
    expect(el.querySelector('.mech-comment-card__place')!.textContent).toBe('Hero banner')

    input.value = 'Make this bolder'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    click(el.querySelector('[data-action="comment"]'))
    await settle()
    expect(backend.comments.create).toHaveBeenCalledWith(
      expect.objectContaining({ page: '/pricing', body: 'Make this bolder' }),
    )
    // The new thread took the draft's place: its pin and its card.
    expect(el.querySelector('.mech-comment-pin.is-draft')).toBeNull()
    expect(el.querySelector('[data-thread-id="new"]')!.classList.contains('is-active')).toBe(true)
    expect(el.querySelector('.mech-comment-card__body')!.textContent).toBe('Make this bolder')
  })

  it('a page click with a thread open only closes it; outside the mode it is not taken', async () => {
    const { store, comments } = await setup()
    renderBlocks()
    comments.openThread('c1')
    expect(commentOnClick(comments, store.content, 'b1', { clientX: 500, clientY: 200 })).toBe(true)
    expect(comments.activeId).toBeNull()
    expect(comments.draft).toBeNull()

    comments.toggleMode() // off
    expect(commentOnClick(comments, store.content, 'b1', { clientX: 500, clientY: 200 })).toBe(false)
    expect(comments.draft).toBeNull()
  })

  it('keeps the text selected in the clicked block as the quote', async () => {
    const { store, comments } = await setup([])
    renderBlocks()
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('text-b1')!)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    commentOnClick(comments, store.content, 'b1', { clientX: 500, clientY: 200 })
    expect(comments.draft!.anchor!.quote).toBe('Some text')

    // A selection in another block is not about this one.
    commentOnClick(comments, store.content, 'b2', { clientX: 500, clientY: 450 })
    expect(comments.draft!.anchor).not.toHaveProperty('quote')
    selection.removeAllRanges()
  })

  it('drops the commenting cursor when the layer goes away', async () => {
    const { store, comments } = await setup()
    mount(CommentPins, store, comments)
    expect(document.documentElement.classList.contains('mech-commenting')).toBe(true)
    apps.pop()!.unmount()
    expect(document.documentElement.classList.contains('mech-commenting')).toBe(false)
  })
})

describe('EditorApp comment mode', () => {
  const mountEditor = async (threads: CommentThread[] | null) => {
    clearFieldEditors()
    registerBuiltinFieldEditors()
    registerFieldSchemas(() => {})
    const fake = fakeBackend(threads ?? [])
    if (!threads) fake.comments.list.mockResolvedValue(null as unknown as CommentThread[])
    setEditorBackend({ ...createEditorBackend(), ...fake.backend })
    renderBlocks()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(EditorApp, {
      state: { content: pageContent, data: {}, page: { path: '/pricing' } },
      components,
    })
    app.mount(el)
    apps.push(app)
    await settle()
    return { el, ...fake }
  }
  const press = (key: string, code?: string) =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }))

  afterEach(() => setEditorBackend(null))

  it('offers the toggle with the open count, and nothing on a host without comments', async () => {
    const { el, backend } = await mountEditor([pinned, pageLevel, resolved])
    expect(backend.comments.list).toHaveBeenCalledWith('/pricing') // the logical path
    const toggle = el.querySelector('.mech-editor__comments')!
    expect(toggle.getAttribute('title')).toBe('Comments (C)')
    expect(toggle.querySelector('.mech-editor__badge')!.textContent).toBe('2')
    // Outside the mode nothing else is drawn.
    expect(el.querySelector('.mech-comments')).toBeNull()
    expect(el.querySelector('.mech-comment-pin')).toBeNull()
    apps.pop()!.unmount()

    const bare = await mountEditor(null)
    expect(bare.el.querySelector('.mech-editor__comments')).toBeNull()
    press('c', 'KeyC')
    await nextTick()
    expect(bare.el.querySelector('.mech-comments')).toBeNull()
    expect(bare.el.querySelector('.mech-palette')).not.toBeNull()
  })

  it('C swaps the palette for the comments panel; a page click drafts instead of selecting; Esc steps out', async () => {
    const { el } = await mountEditor([pinned])
    expect(el.querySelector('.mech-palette')).not.toBeNull()

    press('c', 'KeyC')
    await nextTick()
    expect(el.querySelector('.mech-comments')).not.toBeNull()
    expect(el.querySelector('.mech-palette')).toBeNull()
    expect(el.querySelector('.mech-editor__comments')!.classList.contains('is-active')).toBe(true)
    expect(el.querySelector('[data-thread-id="c1"].mech-comment-pin')).not.toBeNull()

    // A click on a block starts a draft there — the block is not selected.
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 500, clientY: 200 })
    document.getElementById('text-b1')!.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(el.querySelector('.mech-comment-pin.is-draft')).not.toBeNull()
    expect(el.querySelector('.mech-comment-card textarea')).not.toBeNull()
    expect(el.querySelector('.mech-editor__panel--settings')).toBeNull()
    expect(el.querySelector('.mech-frame--selected')).toBeNull()

    // Esc: the draft first, then the mode.
    press('Escape')
    await nextTick()
    expect(el.querySelector('.mech-comment-card')).toBeNull()
    expect(el.querySelector('.mech-comments')).not.toBeNull()
    press('Escape')
    await nextTick()
    expect(el.querySelector('.mech-comments')).toBeNull()
    expect(el.querySelector('.mech-palette')).not.toBeNull()
    expect(el.querySelector('.mech-comment-pin')).toBeNull()
    expect(document.documentElement.classList.contains('mech-commenting')).toBe(false)

    // Back in the editor a click selects again.
    document.getElementById('text-b1')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextTick()
    expect(el.querySelector('.mech-editor__panel--settings')).not.toBeNull()

    // Entering the mode drops that selection; the toolbar button toggles too.
    click(el.querySelector('.mech-editor__comments'))
    await nextTick()
    // (The settings panel slides out through a transition, so it is leaving, not gone.)
    expect(el.querySelector('.mech-editor__panel--settings:not(.mech-slide-right-leave-active)')).toBeNull()
    expect(el.querySelector('.mech-comments')).not.toBeNull()
  })

  it('with the panels collapsed, C alone turns commenting on and off', async () => {
    const { el } = await mountEditor([pinned])
    press(' ', 'Space') // collapse (the panels themselves slide out through a transition)
    await nextTick()
    expect(el.querySelector('.mech-editor')!.classList.contains('is-collapsed')).toBe(true)

    // Collapsed and not commenting: the page is live, nothing is intercepted.
    const live = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.getElementById('text-b1')!.dispatchEvent(live)
    await nextTick()
    expect(live.defaultPrevented).toBe(false)
    expect(el.querySelector('.mech-comment-pin')).toBeNull()

    // C: pins appear over the bare page and a click drafts a comment.
    press('c', 'KeyC')
    await nextTick()
    expect(el.querySelector('[data-thread-id="c1"].mech-comment-pin')).not.toBeNull()
    expect(document.documentElement.classList.contains('mech-commenting')).toBe(true)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 500, clientY: 200 })
    document.getElementById('text-b1')!.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(el.querySelector('.mech-comment-card textarea')).not.toBeNull()
    expect(el.querySelector('.mech-frame--selected')).toBeNull()

    // The mode survives showing the panels again, and C leaves it from either state.
    press('Escape') // the draft
    await nextTick()
    press('c', 'KeyC')
    await nextTick()
    expect(el.querySelector('.mech-comment-pin')).toBeNull()
    expect(document.documentElement.classList.contains('mech-commenting')).toBe(false)
    const after = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.getElementById('text-b1')!.dispatchEvent(after)
    await nextTick()
    expect(after.defaultPrevented).toBe(false)
  })
})

describe('describeElement', () => {
  const mount = (html: string): HTMLElement => {
    const block = document.createElement('section')
    block.setAttribute('data-block-id', 'x1')
    block.innerHTML = html
    document.body.appendChild(block)
    return block
  }

  it('describes the clicked element by tag, classes and text', () => {
    const block = mount('<h2 class="hero__title big">Build   Vue\n sites</h2>')
    expect(describeElement(block.querySelector('h2'), block)).toEqual({
      tag: 'h2',
      classes: ['hero__title', 'big'],
      text: 'Build Vue sites',
    })
    block.remove()
  })

  it('caps long text and leaves out what is empty', () => {
    const block = mount(`<p>${'word '.repeat(60)}</p><img class="shot" src="">`)
    const text = describeElement(block.querySelector('p'), block)!.text!
    expect(text.length).toBeLessThanOrEqual(ELEMENT_TEXT_LIMIT)
    expect(text.endsWith('…')).toBe(true)
    expect(describeElement(block.querySelector('img'), block)).toEqual({ tag: 'img', classes: ['shot'] })
    block.remove()
  })

  it('describes the svg for a click on one of its shapes', () => {
    const block = mount('<svg class="icon"><path d="M0 0"/></svg>')
    expect(describeElement(block.querySelector('path'), block)).toEqual({ tag: 'svg', classes: ['icon'] })
    block.remove()
  })

  it('is undefined for the block itself and for elements outside it', () => {
    const block = mount('<p>in</p>')
    const outside = document.createElement('p')
    document.body.appendChild(outside)
    expect(describeElement(block, block)).toBeUndefined()
    expect(describeElement(outside, block)).toBeUndefined()
    expect(describeElement(null, block)).toBeUndefined()
    block.remove()
    outside.remove()
  })
})
