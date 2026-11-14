import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CommentAnchor, CommentThread, ContentBlock, NewCommentRequest } from 'mechanica-shared'
import {
  agentPrompt,
  anchorFromClick,
  cardPosition,
  createCommentsStore,
  documentVisibility,
  fieldForText,
  initials,
  pinPoint,
  placeThreads,
  quoteFromSelection,
  relativeTime,
  sortThreads,
  threadPlace,
  trimQuote,
  viewportHint,
  COMMENTS_POLL_MS,
  QUOTE_LIMIT,
  type VisibilitySource,
} from '@/editor/lib/comments'
import { BackendError, type EditorBackend } from '@/editor/lib/backend'

const content: ContentBlock[] = [
  { id: 'b1', blockId: 'hero', data: {} },
  {
    id: 'b2',
    blockId: 'section',
    data: {},
    children: [{ id: 'b3', blockId: 'pricing', data: {} }],
  },
]

const rect = { id: 'b1', top: 100, left: 200, width: 400, height: 200 }

let nextId = 0
function makeThread(over: Partial<CommentThread> = {}): CommentThread {
  const id = over.id ?? `c${++nextId}`
  return {
    id,
    page: '/pricing',
    status: 'open',
    createdAt: '2026-11-14T10:00:00.000Z',
    messages: [
      { id: `${id}-m1`, author: { name: 'Den', kind: 'user' }, body: 'Too tight', createdAt: '2026-11-14T10:00:00.000Z' },
    ],
    ...over,
  }
}

const anchorOf = (id: string, blockType: string, path: (number | string)[]): CommentAnchor => ({
  blockId: id,
  blockType,
  path,
})

describe('pinPoint', () => {
  it('puts the pin at the anchor fractions of the block box', () => {
    expect(pinPoint(rect, { x: 0.5, y: 0.25 })).toEqual({ left: 400, top: 150 })
    expect(pinPoint(rect, { x: 0, y: 1 })).toEqual({ left: 200, top: 300 })
  })

  it('defaults to just inside the top-right corner', () => {
    expect(pinPoint(rect, {})).toEqual({ left: 584, top: 116 })
    expect(pinPoint(rect)).toEqual({ left: 584, top: 116 })
  })

  it('never leaves the block box', () => {
    expect(pinPoint(rect, { x: 3, y: -2 })).toEqual({ left: 600, top: 100 })
    // A block smaller than the corner inset keeps the pin on its edge.
    expect(pinPoint({ id: 's', top: 10, left: 10, width: 8, height: 8 })).toEqual({ left: 10, top: 18 })
  })
})

describe('anchorFromClick', () => {
  it('anchors the click as rounded fractions with the viewport and the block place', () => {
    expect(anchorFromClick(content, 'b3', rect, 300, 150, 1440)).toEqual({
      blockId: 'b3',
      blockType: 'pricing',
      path: [1, 0],
      x: 0.25,
      y: 0.25,
      viewport: 1440,
    })
    // 100 / 300 and 200 / 300 → three decimals.
    const third = { top: 0, left: 0, width: 300, height: 300 }
    expect(anchorFromClick(content, 'b1', third, 100, 200, 1440)).toMatchObject({ x: 0.333, y: 0.667 })
  })

  it('clamps a click outside the box and survives an empty rect', () => {
    expect(anchorFromClick(content, 'b1', rect, 50, 900, 390)).toMatchObject({ x: 0, y: 1, viewport: 390 })
    const flat = anchorFromClick(content, 'b1', { top: 0, left: 0, width: 0, height: 0 }, 5, 5, 390)
    expect(flat).toMatchObject({ x: 0, y: 0 })
  })

  it('keeps the selected text as a trimmed, capped quote', () => {
    expect(anchorFromClick(content, 'b1', rect, 200, 100, 1280, '  per  seat\n pricing ')?.quote).toBe('per seat pricing')
    const long = anchorFromClick(content, 'b1', rect, 200, 100, 1280, 'x'.repeat(500))!.quote!
    expect(long).toHaveLength(QUOTE_LIMIT)
    expect(long.endsWith('…')).toBe(true)
    expect(anchorFromClick(content, 'b1', rect, 200, 100, 1280, '   ')).not.toHaveProperty('quote')
  })

  it('is null for a block that is not in the content', () => {
    expect(anchorFromClick(content, 'nope', rect, 0, 0, 1280)).toBeNull()
  })
})

describe('quoteFromSelection', () => {
  const selection = (anchorNode: object | null, text: string, isCollapsed = false) =>
    ({ isCollapsed, anchorNode, toString: () => text }) as unknown as Selection
  const inside = {}
  const block = { contains: (node: unknown) => node === inside } as unknown as Node

  it('takes the selection only when it is inside the block', () => {
    expect(quoteFromSelection(selection(inside, ' $29 / month '), block)).toBe('$29 / month')
    expect(quoteFromSelection(selection({}, 'elsewhere'), block)).toBeUndefined()
    expect(quoteFromSelection(selection(inside, 'collapsed', true), block)).toBeUndefined()
    expect(quoteFromSelection(null, block)).toBeUndefined()
    expect(quoteFromSelection(selection(inside, 'text'), null)).toBeUndefined()
  })

  it('trimQuote drops empties', () => {
    expect(trimQuote(null)).toBeUndefined()
    expect(trimQuote(' \n ')).toBeUndefined()
  })
})

describe('placeThreads', () => {
  it('pins threads to their block as it is now and sets the rest aside', () => {
    const byId = makeThread({ anchor: anchorOf('b1', 'hero', [0]) })
    // The id is gone (re-numbered), but the same type still sits at the old position.
    const byPath = makeThread({ anchor: anchorOf('auto9', 'pricing', [1, 0]) })
    const pageLevel = makeThread()
    const gone = makeThread({ anchor: anchorOf('x', 'testimonials', [5]) })

    const placed = placeThreads(content, [byId, byPath, pageLevel, gone])
    expect(placed.pinned).toEqual([
      { thread: byId, blockId: 'b1' },
      { thread: byPath, blockId: 'b3' },
    ])
    expect(placed.unpinned).toEqual([pageLevel, gone])
    expect(placed.removedIds).toEqual([gone.id])
  })

  it('names where a thread is', () => {
    const names = (type: string) => ({ hero: 'Hero banner' } as Record<string, string>)[type]
    expect(threadPlace(makeThread(), false, names)).toBe('Whole page')
    expect(threadPlace(makeThread({ anchor: anchorOf('b1', 'hero', [0]) }), false, names)).toBe('Hero banner')
    expect(threadPlace(makeThread({ anchor: anchorOf('b3', 'pricing', [1, 0]) }), false, names)).toBe('pricing')
    expect(threadPlace(makeThread({ anchor: anchorOf('x', 'hero', [5]) }), true, names)).toBe('Block removed')
  })
})

describe('sortThreads', () => {
  it('lists open threads first, the newest first within each group', () => {
    const oldOpen = makeThread({ id: 'old', createdAt: '2026-11-10T10:00:00.000Z' })
    const newOpen = makeThread({ id: 'new', createdAt: '2026-11-13T10:00:00.000Z' })
    const resolved = makeThread({ id: 'done', status: 'resolved', createdAt: '2026-11-14T10:00:00.000Z' })
    const input = [resolved, oldOpen, newOpen]
    expect(sortThreads(input).map((thread) => thread.id)).toEqual(['new', 'old', 'done'])
    expect(input[0]).toBe(resolved) // not sorted in place
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-11-14T12:00:00')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const MIN = 60_000
  const HOUR = 60 * MIN

  it('reads recent times in words', () => {
    expect(relativeTime(ago(20_000), now)).toBe('just now')
    expect(relativeTime(ago(5 * MIN + 10_000), now)).toBe('5 min ago')
    expect(relativeTime(ago(59 * MIN), now)).toBe('59 min ago')
    expect(relativeTime(ago(2 * HOUR + 5 * MIN), now)).toBe('2 h ago')
    expect(relativeTime(ago(30 * HOUR), now)).toBe('yesterday')
    // A clock slightly ahead of ours is still "just now".
    expect(relativeTime(ago(-30_000), now.getTime())).toBe('just now')
  })

  it('falls back to a short date, with the year once it differs', () => {
    expect(relativeTime('2026-11-03T12:00:00', now)).toBe('Nov 3')
    expect(relativeTime('2025-03-09T12:00:00', now)).toBe('Mar 9, 2025')
    expect(relativeTime('not a date', now)).toBe('')
  })
})

describe('initials', () => {
  it('takes up to two initials', () => {
    expect(initials('Den')).toBe('D')
    expect(initials('den petrov')).toBe('DP')
    expect(initials('Anna Maria Lopez')).toBe('AL')
    expect(initials('claude-code')).toBe('CC')
    expect(initials('  ')).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})

describe('viewportHint', () => {
  it('speaks up only when the widths differ notably', () => {
    expect(viewportHint({ viewport: 390 }, 1440)).toBe('at 390px')
    expect(viewportHint({ viewport: 1420 }, 1440)).toBeNull()
    expect(viewportHint({ viewport: 1400 }, 1440)).toBeNull() // exactly 40px apart
    expect(viewportHint({}, 1440)).toBeNull()
    expect(viewportHint(null, 1440)).toBeNull()
  })
})

describe('agentPrompt', () => {
  it('tells an agent how to read, resolve and ask about the page comments', () => {
    expect(agentPrompt('/pricing')).toBe(
      'Address the open review comments on the page /pricing. ' +
        'Run `npx mechanica comments --page /pricing` to read them (each one names the block, the file and the line). ' +
        'After fixing one, run `npx mechanica comments resolve <id> --note "what you changed"`; ' +
        'if something is unclear, ask with `npx mechanica comments reply <id> "question"` instead of guessing.',
    )
  })
})

describe('cardPosition', () => {
  const size = { width: 300, height: 200 }
  const viewport = { width: 1440, height: 900 }
  const insets = { left: 300, right: 300 }

  it('sits to the right of the pin, level with it', () => {
    expect(cardPosition({ left: 500, top: 400 }, size, viewport, insets)).toEqual({ left: 534, top: 376 })
  })

  it('flips to the left when it would run under the right panel', () => {
    // 1440 - 300 (panel) - 12 - 300 = 828 is the furthest left edge.
    expect(cardPosition({ left: 1000, top: 400 }, size, viewport, insets).left).toBe(690)
  })

  it('stays clear of both panels when neither side fits, and inside the viewport vertically', () => {
    const narrow = { width: 1000, height: 600 }
    // Room between the panels: 312 … 388.
    expect(cardPosition({ left: 500, top: 10 }, size, narrow, insets)).toEqual({ left: 388, top: 12 })
    expect(cardPosition({ left: 320, top: 590 }, size, narrow, insets)).toEqual({ left: 354, top: 388 })
    // No room at all: pinned to the left panel edge rather than a negative width.
    expect(cardPosition({ left: 500, top: 300 }, size, { width: 700, height: 600 }, insets).left).toBe(312)
  })
})

// ── The store ────────────────────────────────────────────────────────────────

function fakeBackend(initial: CommentThread[] | null = []) {
  let threads = initial ? initial.map((thread) => ({ ...thread })) : null
  const listeners = new Set<() => void>()
  let seq = 100
  const find = (id: string) => {
    const thread = threads?.find((entry) => entry.id === id)
    if (!thread) throw new BackendError('Unknown thread', 404)
    return thread
  }
  const comments = {
    list: vi.fn(async (page?: string) => (threads ? threads.filter((thread) => !page || thread.page === page) : null)),
    create: vi.fn(async (input: NewCommentRequest) => {
      const created = makeThread({
        id: `s${++seq}`,
        page: input.page,
        locale: input.locale,
        anchor: input.anchor,
        messages: [
          { id: `m${seq}`, author: { name: 'Server Sam', kind: 'user' }, body: input.body, createdAt: '2026-11-14T11:00:00.000Z' },
        ],
      })
      threads!.push(created)
      return { ...created }
    }),
    reply: vi.fn(async (id: string, body: string) => {
      const thread = find(id)
      thread.messages = [
        ...thread.messages,
        { id: `m${++seq}`, author: { name: 'Server Sam', kind: 'user' }, body, createdAt: '2026-11-14T11:30:00.000Z' },
      ]
      return { ...thread }
    }),
    setStatus: vi.fn(async (id: string, status: 'open' | 'resolved') => {
      const thread = find(id)
      thread.status = status
      return { ...thread }
    }),
    remove: vi.fn(async (id: string) => {
      find(id)
      threads = threads!.filter((thread) => thread.id !== id)
      return true
    }),
  }
  const backend: Pick<EditorBackend, 'comments' | 'onCommentsChange'> = {
    comments,
    onCommentsChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    backend,
    comments,
    listeners,
    /** Change the host's threads behind the store's back, announcing nothing. */
    setThreads(next: CommentThread[]) {
      threads = next
    },
    /** Change the host's threads behind the store's back and announce it. */
    async changeElsewhere(next: CommentThread[]) {
      threads = next
      for (const listener of listeners) listener()
      await flush()
    },
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))

describe('createCommentsStore', () => {
  it('loads the page threads and becomes available', async () => {
    const open = makeThread()
    const resolved = makeThread({ status: 'resolved' })
    const other = makeThread({ page: '/about' })
    const { backend, comments } = fakeBackend([open, resolved, other])
    const store = createCommentsStore(backend)
    expect(store.available).toBe(false)

    await store.load('/pricing', null)
    expect(comments.list).toHaveBeenCalledWith('/pricing')
    expect(store.available).toBe(true)
    expect(store.page).toBe('/pricing')
    expect(store.threads.map((thread) => thread.id)).toEqual([open.id, resolved.id])
    expect(store.openCount).toBe(1)

    // Resolved threads are listed only on request.
    expect(store.visibleThreads.map((thread) => thread.id)).toEqual([open.id])
    store.showResolved = true
    expect(store.visibleThreads.map((thread) => thread.id)).toEqual([open.id, resolved.id])
  })

  it('stays unavailable for good on a host without comments', async () => {
    const { backend, comments } = fakeBackend(null)
    const store = createCommentsStore(backend)
    await store.load('/pricing')
    expect(store.available).toBe(false)

    // The mode cannot be entered, and the host is not asked again.
    store.toggleMode()
    expect(store.mode).toBe(false)
    await store.load('/about')
    await store.refresh()
    expect(comments.list).toHaveBeenCalledTimes(1)
  })

  it('keeps what it has when a later list fails', async () => {
    const thread = makeThread()
    const { backend, comments } = fakeBackend([thread])
    const store = createCommentsStore(backend)
    await store.load('/pricing')

    comments.list.mockResolvedValueOnce(null)
    await store.refresh()
    expect(store.available).toBe(true)
    expect(store.threads).toHaveLength(1)

    comments.list.mockRejectedValueOnce(new Error('offline'))
    await expect(store.refresh()).resolves.toBeUndefined()
    expect(store.threads).toHaveLength(1)
  })

  it('reloads on a page switch, dropping the old page state', async () => {
    const pricing = makeThread()
    const about = makeThread({ page: '/about' })
    const { backend } = fakeBackend([pricing, about])
    const store = createCommentsStore(backend)
    await store.load('/pricing')
    store.toggleMode()
    store.openThread(pricing.id)

    const loading = store.load('/about')
    // At once: nothing of the old page is shown while the new one loads.
    expect(store.threads).toEqual([])
    expect(store.activeId).toBeNull()
    await loading
    expect(store.threads.map((thread) => thread.id)).toEqual([about.id])
    expect(store.mode).toBe(true) // the mode itself survives the switch
  })

  it('ignores a slow list that lands after a newer one', async () => {
    const pricing = makeThread()
    const about = makeThread({ page: '/about' })
    const { backend, comments } = fakeBackend([pricing, about])
    const store = createCommentsStore(backend)

    let release!: (threads: CommentThread[]) => void
    comments.list.mockImplementationOnce(() => new Promise<CommentThread[]>((resolve) => (release = resolve)))
    const slow = store.load('/pricing')
    await store.load('/about')
    release([pricing])
    await slow
    expect(store.threads.map((thread) => thread.id)).toEqual([about.id])
  })

  it('writes a draft and opens the thread the host returns', async () => {
    const { backend, comments } = fakeBackend([])
    const store = createCommentsStore(backend, { defaultLocale: 'en' })
    await store.load('/pricing', 'ru')
    store.toggleMode()

    const anchor = anchorFromClick(content, 'b3', rect, 300, 150, 1440)!
    store.startDraft(anchor)
    expect(store.draft).toEqual({ anchor })

    // Nothing to send yet.
    expect(await store.submitDraft('   ')).toBeNull()
    expect(comments.create).not.toHaveBeenCalled()

    const created = await store.submitDraft('  Too tight on mobile ')
    expect(comments.create).toHaveBeenCalledWith({ page: '/pricing', locale: 'ru', anchor, body: 'Too tight on mobile' })
    // The author and the id are the host's, not guessed.
    expect(created!.messages[0]!.author.name).toBe('Server Sam')
    expect(store.threads.map((thread) => thread.id)).toEqual([created!.id])
    expect(store.draft).toBeNull()
    expect(store.activeId).toBe(created!.id)
    expect(store.active?.id).toBe(created!.id)
    expect(store.busy).toBe(false)
  })

  it('writes a page-level draft without an anchor, and no locale in the default one', async () => {
    const { backend, comments } = fakeBackend([])
    const store = createCommentsStore(backend, { defaultLocale: 'en' })
    await store.load('/pricing', 'en')
    store.startDraft(null)
    await store.submitDraft('Overall: great')
    expect(comments.create).toHaveBeenCalledWith({ page: '/pricing', body: 'Overall: great' })
  })

  it('starting a draft closes the open thread, and opening a thread drops the draft', async () => {
    const thread = makeThread()
    const { backend } = fakeBackend([thread])
    const store = createCommentsStore(backend)
    await store.load('/pricing')

    store.openThread(thread.id)
    store.startDraft(null)
    expect(store.activeId).toBeNull()
    expect(store.draft).toEqual({ anchor: null })

    store.openThread(thread.id)
    expect(store.draft).toBeNull()
    store.startDraft(null)
    store.cancelDraft()
    expect(store.draft).toBeNull()
  })

  it('replies, resolves, reopens and removes through the host', async () => {
    const thread = makeThread()
    const { backend, comments } = fakeBackend([thread])
    const store = createCommentsStore(backend)
    await store.load('/pricing')
    store.toggleMode()
    store.openThread(thread.id)

    expect(await store.reply(thread.id, ' Fixed in the last commit ')).toBe(true)
    expect(comments.reply).toHaveBeenCalledWith(thread.id, 'Fixed in the last commit')
    expect(store.threads[0]!.messages).toHaveLength(2)
    expect(await store.reply(thread.id, '  ')).toBe(false)

    // Resolving takes the thread out of the list — and its card with it.
    expect(await store.resolve(thread.id)).toBe(true)
    expect(store.threads[0]!.status).toBe('resolved')
    expect(store.openCount).toBe(0)
    expect(store.activeId).toBeNull()
    expect(store.visibleThreads).toEqual([])

    // With resolved threads shown, the card stays through a resolve.
    store.showResolved = true
    store.openThread(thread.id)
    expect(await store.reopen(thread.id)).toBe(true)
    expect(store.threads[0]!.status).toBe('open')
    expect(await store.resolve(thread.id)).toBe(true)
    expect(store.activeId).toBe(thread.id)

    expect(await store.remove(thread.id)).toBe(true)
    expect(store.threads).toEqual([])
    expect(store.activeId).toBeNull()
  })

  it('surfaces failures as an error string, never a rejection', async () => {
    const thread = makeThread()
    const { backend, comments } = fakeBackend([thread])
    const store = createCommentsStore(backend)
    await store.load('/pricing')

    comments.reply.mockRejectedValueOnce(new BackendError('Reply failed (500)', 500))
    expect(await store.reply(thread.id, 'Hi')).toBe(false)
    expect(store.error).toBe('Reply failed (500)')
    expect(store.busy).toBe(false)
    expect(store.threads[0]!.messages).toHaveLength(1)

    // The next write clears it.
    expect(await store.reply(thread.id, 'Hi again')).toBe(true)
    expect(store.error).toBeNull()

    comments.setStatus.mockRejectedValueOnce(new BackendError('Update failed (500)', 500))
    expect(await store.resolve(thread.id)).toBe(false)
    expect(store.error).toBe('Update failed (500)')
    expect(store.threads[0]!.status).toBe('open')

    comments.remove.mockResolvedValueOnce(false)
    expect(await store.remove(thread.id)).toBe(false)
    expect(store.error).toBe('Could not delete the comment')
    expect(store.threads).toHaveLength(1)

    // A failed draft keeps the draft, so the text can be sent again.
    store.startDraft(null)
    comments.create.mockRejectedValueOnce(new Error(''))
    expect(await store.submitDraft('Hello')).toBeNull()
    expect(store.error).toBe('Could not post the comment')
    expect(store.draft).toEqual({ anchor: null })
  })

  it('reloads when comments change elsewhere, until disposed', async () => {
    const thread = makeThread()
    const fake = fakeBackend([thread])
    const store = createCommentsStore(fake.backend)
    await store.load('/pricing')
    store.toggleMode()
    store.openThread(thread.id)

    // An agent resolved it from the CLI and left a note.
    const fromAgent = makeThread({
      id: thread.id,
      status: 'resolved',
      messages: [
        ...thread.messages,
        { id: 'a1', author: { name: 'Claude', kind: 'agent' }, body: 'Widened the gap', createdAt: '2026-11-14T11:00:00.000Z' },
      ],
    })
    const another = makeThread()
    await fake.changeElsewhere([fromAgent, another])
    expect(store.threads.map((entry) => entry.id)).toEqual([thread.id, another.id])
    expect(store.threads[0]!.status).toBe('resolved')
    expect(store.active).toBeNull() // resolved and not shown

    // A deleted thread closes its card.
    store.openThread(another.id)
    await fake.changeElsewhere([fromAgent])
    expect(store.activeId).toBeNull()

    store.dispose()
    expect(fake.listeners.size).toBe(0)
  })

  it('leaving comment mode cancels the draft and closes the open thread', async () => {
    const thread = makeThread()
    const { backend } = fakeBackend([thread])
    const store = createCommentsStore(backend)
    await store.load('/pricing')

    store.toggleMode()
    expect(store.mode).toBe(true)
    store.startDraft(null)
    store.toggleMode()
    expect(store.mode).toBe(false)
    expect(store.draft).toBeNull()

    store.toggleMode()
    store.openThread(thread.id)
    store.toggleMode()
    expect(store.activeId).toBeNull()
  })

  it('escape steps back one level at a time', async () => {
    const thread = makeThread()
    const { backend } = fakeBackend([thread])
    const store = createCommentsStore(backend)
    await store.load('/pricing')
    expect(store.escape()).toBe(false) // not commenting: nothing to leave

    store.toggleMode()
    store.startDraft(null)
    expect(store.escape()).toBe(true)
    expect(store.draft).toBeNull()
    expect(store.mode).toBe(true)

    store.openThread(thread.id)
    expect(store.escape()).toBe(true)
    expect(store.activeId).toBeNull()
    expect(store.mode).toBe(true)

    expect(store.escape()).toBe(true)
    expect(store.mode).toBe(false)
  })

  it('does not let a write that lands late replace a newer draft', async () => {
    const { backend, comments } = fakeBackend([])
    const store = createCommentsStore(backend)
    await store.load('/pricing')
    store.toggleMode()
    store.startDraft(null)

    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const create = comments.create.getMockImplementation()!
    comments.create.mockImplementationOnce(async (input) => {
      await held
      return create(input)
    })
    const sending = store.submitDraft('First')
    const anchor = anchorFromClick(content, 'b1', rect, 300, 150, 1440)!
    store.startDraft(anchor) // a click elsewhere while the first one is in flight
    release()
    await sending
    expect(store.threads).toHaveLength(1)
    expect(store.draft).toEqual({ anchor })
    expect(store.activeId).toBeNull()
  })
})

describe('createCommentsStore — re-reading on a timer', () => {
  afterEach(() => vi.useRealTimers())

  /** A tab that can be hidden and shown. */
  function fakeVisibility(visible = true) {
    const listeners = new Set<() => void>()
    const source: VisibilitySource = {
      visible: () => visible,
      onChange(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    return {
      source,
      listeners,
      set(next: boolean) {
        visible = next
        for (const listener of listeners) listener()
      },
    }
  }

  /** Let the pending promise callbacks run without moving the clock. */
  const settle = () => vi.advanceTimersByTimeAsync(0)

  it('re-reads the page’s threads every pollMs once the host has comments', async () => {
    vi.useFakeTimers()
    const thread = makeThread()
    const fake = fakeBackend([thread])
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: fakeVisibility().source })

    // Nothing is asked before the first load says the host has comments.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fake.comments.list).not.toHaveBeenCalled()

    await store.load('/pricing')
    expect(fake.comments.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4999)
    expect(fake.comments.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fake.comments.list).toHaveBeenCalledTimes(2)
    expect(fake.comments.list).toHaveBeenLastCalledWith('/pricing')

    // A comment made elsewhere — a host without live events — shows up with the next poll.
    const another = makeThread()
    fake.setThreads([thread, another])
    await vi.advanceTimersByTimeAsync(5000)
    expect(store.threads.map((entry) => entry.id)).toEqual([thread.id, another.id])

    // It follows the page.
    await store.load('/about')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.comments.list).toHaveBeenLastCalledWith('/about')
    store.dispose()
  })

  it('polls every 20 seconds by default', async () => {
    vi.useFakeTimers()
    expect(COMMENTS_POLL_MS).toBe(20_000)
    const fake = fakeBackend([makeThread()])
    const store = createCommentsStore(fake.backend)
    await store.load('/pricing')
    await vi.advanceTimersByTimeAsync(19_999)
    expect(fake.comments.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fake.comments.list).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('never polls a host without comments', async () => {
    vi.useFakeTimers()
    const visibility = fakeVisibility()
    const fake = fakeBackend(null)
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: visibility.source })
    await store.load('/pricing')
    await vi.advanceTimersByTimeAsync(60_000)
    visibility.set(false)
    visibility.set(true)
    await settle()
    expect(fake.comments.list).toHaveBeenCalledTimes(1)
    expect(visibility.listeners.size).toBe(0)
    store.dispose()
  })

  it('rests while the tab is hidden, and re-reads the moment it is back', async () => {
    vi.useFakeTimers()
    const visibility = fakeVisibility()
    const fake = fakeBackend([makeThread()])
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: visibility.source })
    await store.load('/pricing')

    visibility.set(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.comments.list).toHaveBeenCalledTimes(1)

    visibility.set(true)
    await settle()
    expect(fake.comments.list).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('pollMs: 0 turns it off', async () => {
    vi.useFakeTimers()
    const visibility = fakeVisibility()
    const fake = fakeBackend([makeThread()])
    const store = createCommentsStore(fake.backend, { pollMs: 0, visibility: visibility.source })
    await store.load('/pricing')
    await vi.advanceTimersByTimeAsync(120_000)
    visibility.set(false)
    visibility.set(true)
    await settle()
    expect(fake.comments.list).toHaveBeenCalledTimes(1)
    expect(visibility.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops for good when disposed', async () => {
    vi.useFakeTimers()
    const visibility = fakeVisibility()
    const fake = fakeBackend([makeThread()])
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: visibility.source })
    await store.load('/pricing')
    expect(visibility.listeners.size).toBe(1)

    store.dispose()
    expect(visibility.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.comments.list).toHaveBeenCalledTimes(1)

    // A load after the fact does not bring the timer back.
    await store.load('/about')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves the draft, the open thread and the mode alone', async () => {
    vi.useFakeTimers()
    const thread = makeThread()
    const fake = fakeBackend([thread])
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: fakeVisibility().source })
    await store.load('/pricing')
    store.toggleMode()

    const anchor = anchorFromClick(content, 'b1', rect, 300, 150, 1440)!
    store.startDraft(anchor)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(store.draft).toEqual({ anchor })
    expect(store.mode).toBe(true)

    store.openThread(thread.id)
    store.error = 'Could not send the reply'
    await vi.advanceTimersByTimeAsync(15_000)
    expect(store.activeId).toBe(thread.id)
    expect(store.error).toBe('Could not send the reply')
    expect(fake.comments.list.mock.calls.length).toBeGreaterThan(4)
    store.dispose()
  })

  it('does not ask while a write is in flight', async () => {
    vi.useFakeTimers()
    const thread = makeThread()
    const fake = fakeBackend([thread])
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: fakeVisibility().source })
    await store.load('/pricing')

    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const reply = fake.comments.reply.getMockImplementation()!
    fake.comments.reply.mockImplementationOnce(async (id, body) => {
      await held
      return reply(id, body)
    })
    const sending = store.reply(thread.id, 'On it')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fake.comments.list).toHaveBeenCalledTimes(1)

    release()
    expect(await sending).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.comments.list).toHaveBeenCalledTimes(2)
    expect(store.threads[0]!.messages).toHaveLength(2)
    store.dispose()
  })

  it('a list asked for before a write landed does not take the write back out', async () => {
    vi.useFakeTimers()
    const fake = fakeBackend([])
    const store = createCommentsStore(fake.backend, { pollMs: 5000, visibility: fakeVisibility().source })
    await store.load('/pricing')
    store.toggleMode()
    store.startDraft(null)

    // The poll's list leaves before the comment is posted and lands after it —
    // with what the host had before.
    let release!: (threads: CommentThread[]) => void
    fake.comments.list.mockImplementationOnce(() => new Promise<CommentThread[]>((resolve) => (release = resolve)))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.comments.list).toHaveBeenCalledTimes(2)

    const created = await store.submitDraft('Posted meanwhile')
    expect(store.threads.map((entry) => entry.id)).toEqual([created!.id])
    release([])
    await settle()

    // The stale answer was dropped and the list asked for again.
    expect(fake.comments.list).toHaveBeenCalledTimes(3)
    expect(store.threads.map((entry) => entry.id)).toEqual([created!.id])
    expect(store.activeId).toBe(created!.id)
    store.dispose()
  })

  it('reads the document’s visibility by default, and survives having no document', () => {
    // This suite runs in Node: no document, so always visible and nothing to listen to.
    expect(typeof document).toBe('undefined')
    expect(documentVisibility.visible()).toBe(true)
    const stop = documentVisibility.onChange(() => {})
    expect(() => stop()).not.toThrow()

    const listeners = new Map<string, () => void>()
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    })
    try {
      expect(documentVisibility.visible()).toBe(false)
      const off = documentVisibility.onChange(() => {})
      expect([...listeners.keys()]).toEqual(['visibilitychange'])
      off()
      expect(listeners.size).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('fieldForText', () => {
  const data = {
    title: 'Start free. Scale when you ship.',
    eyebrow: 'Pricing',
    plans: [
      { name: 'Open source', price: '$0', note: 'Free forever' },
      { name: 'Team', price: '$19 / month', note: 'Free forever' },
    ],
    body: [{ type: 'paragraph', children: [{ children: [{ text: 'A long rich text paragraph.' }] }] }],
  }

  it('names the one prop whose text equals the element text', () => {
    expect(fieldForText(data, '  Start free.  Scale when\nyou ship. ')).toBe('title')
    expect(fieldForText(data, 'Open source')).toBe('plans.0.name')
  })

  it('falls back to the one prop that contains the text', () => {
    expect(fieldForText(data, '$19')).toBe('plans.1.price')
  })

  it('cuts a deep path to its first key', () => {
    expect(fieldForText(data, 'A long rich text paragraph.')).toBe('body')
  })

  it('names nothing when the text is ambiguous, too short or absent', () => {
    expect(fieldForText(data, 'Free forever')).toBeUndefined()
    expect(fieldForText(data, '$0')).toBeUndefined()
    expect(fieldForText(data, 'Not on the page')).toBeUndefined()
    expect(fieldForText(data, '')).toBeUndefined()
    expect(fieldForText(undefined, 'Pricing')).toBeUndefined()
  })
})

describe('anchorFromClick — what was clicked', () => {
  it('keeps the element and the field, and omits empty ones', () => {
    const rect = { top: 0, left: 0, width: 100, height: 100 }
    const block: ContentBlock[] = [{ id: 'b1', blockId: 'hero', data: {} }]
    const element = { tag: 'h2', classes: ['hero__title'], text: 'Welcome' }
    expect(anchorFromClick(block, 'b1', rect, 10, 10, 1440, null, { element, field: 'title' })).toMatchObject({
      element,
      field: 'title',
    })
    const bare = anchorFromClick(block, 'b1', rect, 10, 10, 1440, null, {})!
    expect(bare).not.toHaveProperty('element')
    expect(bare).not.toHaveProperty('field')
  })
})
