import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import type { CommentThread } from 'mechanica-shared'
import { cliCommentAuthor, formatCommentsDigest, locateComment, runComments, type CommentLocation } from '@/cli/comments'
import { fsCommentStore, memoryCommentStore, type CommentStore } from '@/server/comments-store'

let cwd: string
let out: string[]
const log = (text: string) => void out.push(text)
const output = () => out.join('\n')

const write = (file: string, lines: string[]) => {
  const path = join(cwd, '.mech', file)
  fs.mkdirSync(join(path, '..'), { recursive: true })
  fs.writeFileSync(path, lines.join('\n') + '\n')
}

const PRICING = [
  '---', // 1
  'name: Pricing', // 2
  'data: {}', // 3
  '---', // 4
  '', // 5
  '::: hero #top', // 6
  'title: Pricing', // 7
  ':::', // 8
  '', // 9
  '::: section #wrap', // 10
  '::: pricing #plans', // 11
  'plans:', // 12
  '  - { name: Pro, price: 29 }', // 13
  ':::', // 14
  '::: /section', // 15
  '', // 16
  '::: card', // 17
  ':::', // 18
  '::: card', // 19
  ':::', // 20
]

const den = { name: 'Den', kind: 'user' as const }
const claude = { name: 'Claude', kind: 'agent' as const }

const thread = (id: string, patch: Partial<CommentThread> & { body?: string } = {}): CommentThread => {
  const { body = 'Fix this', ...rest } = patch
  return {
    id,
    page: '/pricing',
    status: 'open',
    createdAt: '2026-11-14T10:32:05.000Z',
    messages: [{ id: `m_${id}`, author: den, body, createdAt: '2026-11-14T10:32:05.000Z' }],
    ...rest,
  }
}

const anchored = (): CommentThread =>
  thread('c_plans001', {
    body: 'Pro should be €29, not $29.\nAnd monthly.',
    anchor: { blockId: 'plans', blockType: 'pricing', path: [1, 0], field: 'plans.0.price', quote: '$29', viewport: 390 },
    messages: [
      { id: 'm_1', author: den, body: 'Pro should be €29, not $29.\nAnd monthly.', createdAt: '2026-11-14T10:32:05.000Z' },
      { id: 'm_2', author: claude, body: 'Which currency for the yearly plan?\nSame?', createdAt: '2026-11-14T11:00:00.000Z' },
    ],
  })

beforeEach(() => {
  cwd = fs.mkdtempSync(join(os.tmpdir(), 'mech-comments-cli-'))
  out = []
  write('pages/pricing.page.md', PRICING)
  write('pages/index.page.md', ['::: hero #top', ':::'])
})
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }))

const run = (args: string[], store: CommentStore, options: Parameters<typeof runComments>[1] = {}) =>
  runComments(args, { cwd, store, log, env: {}, as: 'Tester', ...options })

describe('locateComment', () => {
  it('points at the block’s open fence in the page file', () => {
    expect(locateComment(cwd, anchored())).toEqual({
      file: '.mech/pages/pricing.page.md',
      line: 11,
      blockId: 'plans',
      blockType: 'pricing',
    })
  })

  it('follows a block whose positional id shifted', () => {
    // `auto1` was the first card; the anchor's id is stale but the position holds.
    const moved = thread('c_1', { anchor: { blockId: 'auto9', blockType: 'card', path: [3] } })
    expect(locateComment(cwd, moved)).toMatchObject({ line: 19, blockId: 'auto2', blockType: 'card' })
  })

  it('has no line for a whole-page thread or a block that is gone', () => {
    const none = { file: '.mech/pages/pricing.page.md', line: null, blockId: null, blockType: null }
    expect(locateComment(cwd, thread('c_1'))).toEqual(none)
    expect(locateComment(cwd, thread('c_2', { anchor: { blockId: 'x', blockType: 'faq', path: [8] } }))).toEqual(none)
    // Two cards, neither at the old position: ambiguous.
    expect(locateComment(cwd, thread('c_3', { anchor: { blockId: 'x', blockType: 'card', path: [0] } }))).toEqual(none)
  })

  it('answers null when the page has no file, or one that does not parse', () => {
    expect(locateComment(cwd, thread('c_1', { page: '/gone' }))).toBeNull()
    write('pages/broken.page.md', ['::: hero', 'never closed'])
    expect(locateComment(cwd, thread('c_2', { page: '/broken' }))).toBeNull()
  })

  it('resolves the home page and directory index pages', () => {
    write('pages/blog/index.page.md', ['', '::: list #posts', ':::'])
    const at = (page: string, blockId: string, blockType: string) =>
      locateComment(cwd, thread('c_1', { page, anchor: { blockId, blockType, path: [0] } }))
    expect(at('/', 'top', 'hero')).toMatchObject({ file: '.mech/pages/index.page.md', line: 1 })
    expect(at('/blog', 'posts', 'list')).toMatchObject({ file: '.mech/pages/blog/index.page.md', line: 2 })
  })

  it('points into the translation file when the block is there, else into the base', () => {
    write('pages/pricing@ru.page.md', ['---', 'name: Цены', '---', '', '::: pricing #plans', 'plans: []', ':::'])
    const ru = { ...anchored(), locale: 'ru' }
    expect(locateComment(cwd, ru)).toEqual({
      file: '.mech/pages/pricing@ru.page.md',
      line: 5,
      blockId: 'plans',
      blockType: 'pricing',
    })
    const hero = thread('c_1', { locale: 'ru', anchor: { blockId: 'top', blockType: 'hero', path: [0] } })
    expect(locateComment(cwd, hero)).toMatchObject({ file: '.mech/pages/pricing.page.md', line: 6 })
    // No translation file at all: the base page.
    expect(locateComment(cwd, { ...hero, locale: 'ja' })).toMatchObject({ file: '.mech/pages/pricing.page.md', line: 6 })
  })
})

describe('formatCommentsDigest', () => {
  const locate = (item: CommentThread): CommentLocation | null => locateComment(cwd, item)

  it('prints one anchored thread with everything an agent needs', () => {
    expect(formatCommentsDigest([anchored()], locate)).toBe(
      [
        '# Review comments — 1 open on 1 page',
        '',
        '## /pricing — 1 open',
        '',
        '### c_plans001 · Den · 2026-11-14 10:32',
        '`pricing` block `#plans` — .mech/pages/pricing.page.md:11',
        'Field: `plans.0.price` · Quote: "$29" · Viewport: 390px',
        '',
        '> Pro should be €29, not $29.',
        '> And monthly.',
        '  ↳ Claude: Which currency for the yearly plan?',
        '    Same?',
        '',
        'See it: `mechanica shot /pricing --section "#plans" --width 390`',
        '',
        '---',
        'When a comment is dealt with: `mechanica comments resolve <id> --note "what changed"`. To ask or answer without closing it: `mechanica comments reply <id> "…"`.',
      ].join('\n'),
    )
  })

  it('says plainly when the block is gone, and what it was', () => {
    const gone = thread('c_gone', { anchor: { blockId: 'faq1', blockType: 'faq', path: [2, 'aside', 0] } })
    const digest = formatCommentsDigest([gone], locate)
    expect(digest).toContain(
      'Block not found on the page any more — was `faq` `#faq1` at position 3 › aside › 1 (`.mech/pages/pricing.page.md`)',
    )
    expect(digest).toContain('See it: `mechanica shot /pricing`')
    expect(digest).not.toContain('--section')
  })

  it('marks whole-page threads and pages without a file', () => {
    const digest = formatCommentsDigest([thread('c_page'), thread('c_lost', { page: '/gone' })], locate)
    expect(digest).toContain('# Review comments — 2 open on 2 pages')
    expect(digest).toContain('Whole page — `.mech/pages/pricing.page.md`')
    expect(digest).toContain('## /gone — 1 open')
    expect(digest).toContain('Whole page — the page has no file any more')
    expect(digest.match(/See it:/g)).toHaveLength(1)
  })

  it('groups by page and shows statuses only when asked', () => {
    const threads = [
      thread('c_a'),
      thread('c_b', { page: '/' }),
      thread('c_c', {
        status: 'resolved',
        resolvedAt: '2026-11-15T09:00:00.000Z',
        resolvedBy: claude,
      }),
    ]
    const digest = formatCommentsDigest(threads, locate, { showStatus: true })
    expect(digest).toContain('# Review comments — 2 open, 1 resolved on 2 pages')
    expect(digest).toContain('## /pricing — 1 open, 1 resolved')
    expect(digest).toContain('## / — 1 open')
    expect(digest).toContain('### c_a · open · Den · 2026-11-14 10:32')
    expect(digest).toContain('### c_c · resolved · Den · 2026-11-14 10:32')
    expect(digest).toContain('  ✓ Resolved by Claude, 2026-11-15 09:00')
    // Each page's threads sit under its heading.
    expect(digest.indexOf('### c_c')).toBeLessThan(digest.indexOf('## / —'))
    expect(digest.indexOf('### c_b')).toBeGreaterThan(digest.indexOf('## / —'))

    expect(formatCommentsDigest(threads.slice(0, 2), locate)).toContain('### c_a · Den · 2026-11-14 10:32')
  })

  it('shoots a translation at its own address', () => {
    const ru = { ...anchored(), locale: 'ru' }
    const digest = formatCommentsDigest([ru, thread('c_home', { page: '/', locale: 'ru' })], locate)
    expect(digest).toContain('### c_plans001 · Den · 2026-11-14 10:32 · locale ru')
    expect(digest).toContain('`mechanica shot /ru/pricing --section "#plans" --width 390`')
    expect(digest).toContain('`mechanica shot /ru`')
  })

  it('names the clicked element and marks the spot on the shot', () => {
    const base = anchored()
    const pinned = {
      ...base,
      anchor: {
        ...base.anchor!,
        element: { tag: 'span', classes: ['plan__price', 'is-big'], text: '$29  / month' },
        x: 0.62,
        y: 0.31,
      },
    }
    const digest = formatCommentsDigest([pinned], locate)
    expect(digest).toContain(
      'Element: `span.plan__price.is-big` "$29 / month" · Field: `plans.0.price` · Quote: "$29" · Viewport: 390px',
    )
    expect(digest).toContain(
      'See it: `mechanica shot /pricing --section "#plans" --width 390 --mark 0.62,0.31` (a ring marks the commented spot)',
    )
    // No click point, no mark.
    expect(formatCommentsDigest([anchored()], locate)).not.toContain('--mark')
  })

  it('is one line when there is nothing', () => {
    expect(formatCommentsDigest([], locate)).toBe('No open comments.')
    expect(formatCommentsDigest([], locate, { showStatus: true })).toBe('No comments.')
  })
})

describe('mechanica comments', () => {
  it('lists the open threads; --all adds the resolved, --page narrows', async () => {
    const store = memoryCommentStore([
      anchored(),
      thread('c_done', { status: 'resolved', body: 'Old one' }),
      thread('c_home', { page: '/', body: 'Home thing' }),
    ])

    await run([], store)
    expect(output()).toContain('# Review comments — 2 open on 2 pages')
    expect(output()).toContain('.mech/pages/pricing.page.md:11')
    expect(output()).not.toContain('c_done')

    out = []
    await run(['list'], store, { all: true })
    expect(output()).toContain('### c_done · resolved · Den')

    out = []
    await run([], store, { page: 'pricing' })
    expect(output()).toContain('# Review comments — 1 open on 1 page')
    expect(output()).not.toContain('c_home')
  })

  it('prints a single line when there is nothing to do', async () => {
    const store = memoryCommentStore([thread('c_done', { status: 'resolved' })])
    await run([], store)
    await run([], store, { page: '/about/' })
    await run([], memoryCommentStore(), { all: true })
    expect(out).toEqual(['No open comments.', 'No open comments on /about.', 'No comments.'])
  })

  it('--json prints the threads with their locations', async () => {
    const source = [anchored(), thread('c_lost', { page: '/gone' }), thread('c_done', { status: 'resolved' })]
    await run([], memoryCommentStore(source), { json: true })
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0]!)).toEqual([
      { ...source[0], location: { file: '.mech/pages/pricing.page.md', line: 11, blockId: 'plans', blockType: 'pricing' } },
      { ...source[1], location: null },
    ])

    out = []
    await run([], memoryCommentStore(), { json: true })
    expect(out).toEqual(['[]'])
  })

  it('adds a page thread and a block thread', async () => {
    const store = memoryCommentStore()
    await run(['add', 'pricing', 'Check the whole page'], store)
    await run(['add', '/pricing', 'Wrong price'], store, { block: 'plans', locale: 'ru', as: 'Den' })

    const [page, block] = await store.list()
    expect(page).toMatchObject({ page: '/pricing', status: 'open' })
    expect(page!.anchor).toBeUndefined()
    expect(page!.messages[0]).toMatchObject({ body: 'Check the whole page', author: { name: 'Tester', kind: 'user' } })
    expect(block).toMatchObject({
      locale: 'ru',
      anchor: { blockId: 'plans', blockType: 'pricing', path: [1, 0] },
    })
    expect(block!.messages[0]!.author).toEqual({ name: 'Den', kind: 'user' })
    expect(out).toEqual([`Added ${page!.id} on /pricing`, `Added ${block!.id} on /pricing (\`pricing\` #plans)`])
  })

  it('refuses to add to an unknown page or block, or without text', async () => {
    const store = memoryCommentStore()
    await expect(run(['add', '/nope', 'x'], store)).rejects.toThrow('No page "/nope"')
    await expect(run(['add', '/pricing', 'x'], store, { block: 'nope' })).rejects.toThrow(
      'No block "#nope" on /pricing — its blocks: #top, #wrap, #plans, #auto1, #auto2',
    )
    await expect(run(['add', '/pricing'], store)).rejects.toThrow(/needs some text/)
    await expect(run(['add'], store)).rejects.toThrow(/Usage/)
    expect(await store.list()).toEqual([])
  })

  it('replies, resolves with a note, and reopens', async () => {
    const store = memoryCommentStore([thread('c_one')])

    await run(['reply', 'c_one', 'Which one?'], store)
    await run(['resolve', 'c_one'], store, { note: 'Changed the price to €29', as: undefined, env: { CLAUDECODE: '1' } })
    let stored = (await store.get('c_one'))!
    expect(stored.status).toBe('resolved')
    expect(stored.resolvedBy).toEqual(claude)
    expect(stored.messages.map((message) => [message.author.name, message.body])).toEqual([
      ['Den', 'Fix this'],
      ['Tester', 'Which one?'],
      ['Claude', 'Changed the price to €29'],
    ])

    await run(['resolve', 'c_one'], store)
    await run(['reopen', 'c_one'], store)
    await run(['reopen', 'c_one'], store)
    stored = (await store.get('c_one'))!
    expect(stored.status).toBe('open')
    expect(stored.resolvedBy).toBeUndefined()
    expect(stored.messages).toHaveLength(3)
    expect(out).toEqual([
      'Replied to c_one',
      'Resolved c_one',
      'c_one was already resolved',
      'Reopened c_one',
      'c_one is already open',
    ])
  })

  it('names an unknown thread, an empty reply and an unknown command', async () => {
    const store = memoryCommentStore([thread('c_one')])
    for (const action of ['reply', 'resolve', 'reopen']) {
      await expect(run([action, 'c_nope', 'text'], store)).rejects.toThrow('No comment thread "c_nope"')
      await expect(run([action], store)).rejects.toThrow(/Usage/)
    }
    await expect(run(['reply', 'c_one', ' '], store)).rejects.toThrow(/needs some text/)
    await expect(run(['frobnicate'], store)).rejects.toThrow('Unknown comments command "frobnicate"')
    // A usage error is a plain Error: the CLI prints its message, not a stack.
    const error = await run(['reply', 'c_nope', 'x'], store).catch((caught: unknown) => caught)
    expect((error as Error).constructor).toBe(Error)
  })

  it('works on <cwd>/.mech/comments by default', async () => {
    await runComments(['add', '/pricing', 'From the CLI'], { cwd, log, as: 'Den', block: 'top' })
    const [stored] = await fsCommentStore(join(cwd, '.mech')).list()
    expect(stored).toMatchObject({ page: '/pricing', anchor: { blockId: 'top', blockType: 'hero', path: [0] } })
    expect(fs.existsSync(join(cwd, '.mech', 'comments', '.gitignore'))).toBe(true)

    out = []
    await runComments([], { cwd, log })
    expect(output()).toContain(`### ${stored!.id} · Den · `)
    expect(output()).toContain('`hero` block `#top` — .mech/pages/pricing.page.md:6')
  })
})

describe('cliCommentAuthor', () => {
  it('prefers --as, then a Claude Code session, then the local user', () => {
    expect(cliCommentAuthor({ as: ' Ann ', env: { CLAUDECODE: '1' } })).toEqual({ name: 'Ann', kind: 'user' })
    expect(cliCommentAuthor({ env: { CLAUDECODE: '1' } })).toEqual({ name: 'Claude', kind: 'agent' })
    const local = cliCommentAuthor({ env: {}, cwd: os.tmpdir() })
    expect(local.kind).toBe('user')
    expect(local.name).not.toBe('')
  })
})
