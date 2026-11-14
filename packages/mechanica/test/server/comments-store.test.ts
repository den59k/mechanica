import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import type { CommentAuthor } from 'mechanica-shared'
import {
  cleanCommentAnchor,
  fsCommentStore,
  localCommentAuthor,
  memoryCommentStore,
  normalizeCommentPage,
  type CommentStore,
} from '@/server/comments-store'

const den: CommentAuthor = { name: 'Den', kind: 'user' }
const claude: CommentAuthor = { name: 'Claude', kind: 'agent' }
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/

let mechDir: string
let store: CommentStore

const file = () => join(mechDir, 'comments', 'comments.json')
const onDisk = () => JSON.parse(fs.readFileSync(file(), 'utf-8')) as { version: number; threads: unknown[] }

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-comments-'))
  store = fsCommentStore(mechDir)
})
afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('fsCommentStore', () => {
  it('is empty, and writes nothing, until a comment is made', async () => {
    expect(await store.list()).toEqual([])
    expect(await store.get('c_nope')).toBeNull()
    expect(fs.existsSync(join(mechDir, 'comments'))).toBe(false)
  })

  it('creates a thread with ids, timestamps and a normalized page', async () => {
    const thread = await store.create(
      {
        page: 'pricing/',
        body: '  Too expensive\r\nsecond line  ',
        anchor: { blockId: 'plans', blockType: 'pricing', path: [2], field: 'plans.1.price', viewport: 390 },
      },
      den,
    )

    expect(thread.id).toMatch(/^c_[0-9a-z]{8}$/)
    expect(thread.page).toBe('/pricing')
    expect(thread.status).toBe('open')
    expect(thread.createdAt).toMatch(ISO)
    expect(thread.locale).toBeUndefined()
    expect(thread.anchor).toEqual({ blockId: 'plans', blockType: 'pricing', path: [2], field: 'plans.1.price', viewport: 390 })
    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]).toMatchObject({ author: den, body: 'Too expensive\nsecond line', createdAt: thread.createdAt })
    expect(thread.messages[0]!.id).toMatch(/^m_[0-9a-z]{8}$/)

    // On disk: versioned, pretty-printed, newline-terminated.
    const text = fs.readFileSync(file(), 'utf-8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "threads": [')
    expect(onDisk()).toEqual({ version: 1, threads: [thread] })
    expect(await store.get(thread.id)).toEqual(thread)
  })

  it('stores only what a thread is made of', async () => {
    const thread = await store.create(
      {
        page: '/',
        body: 'Hi',
        locale: 'ru',
        status: 'resolved',
        id: 'c_mine',
        anchor: { blockId: 'a', blockType: 'hero', path: [0], junk: true },
      } as never,
      { ...den, id: 'u1', admin: true } as never,
    )
    expect(thread.id).not.toBe('c_mine')
    expect(thread.status).toBe('open')
    expect(thread.locale).toBe('ru')
    expect(thread.anchor).toEqual({ blockId: 'a', blockType: 'hero', path: [0] })
    expect(thread.messages[0]!.author).toEqual({ name: 'Den', kind: 'user', id: 'u1' })
  })

  it('rejects an empty body, a missing page and a malformed anchor', async () => {
    await expect(store.create({ page: '/', body: '   ' }, den)).rejects.toThrow(/text/)
    await expect(store.create({ page: ' ', body: 'x' }, den)).rejects.toThrow(/page/)
    await expect(store.create({ page: '/', body: 'x', anchor: { blockId: 'a' } as never }, den)).rejects.toThrow(/anchor/)
    const thread = await store.create({ page: '/', body: 'x' }, den)
    await expect(store.reply(thread.id, '\n ', den)).rejects.toThrow(/text/)
    expect((await store.get(thread.id))!.messages).toHaveLength(1)
  })

  it('lists oldest first, for the site or for one page', async () => {
    const a = await store.create({ page: '/', body: 'home' }, den)
    const b = await store.create({ page: '/pricing', body: 'one' }, den)
    const c = await store.create({ page: '/pricing/', body: 'two' }, den)

    expect((await store.list()).map((thread) => thread.id)).toEqual([a.id, b.id, c.id])
    expect((await store.list({ page: 'pricing' })).map((thread) => thread.id)).toEqual([b.id, c.id])
    expect((await store.list({ page: '/' })).map((thread) => thread.id)).toEqual([a.id])
    expect(await store.list({ page: '/nope' })).toEqual([])
  })

  it('appends replies', async () => {
    const thread = await store.create({ page: '/', body: 'Fix the title' }, den)
    const replied = await store.reply(thread.id, ' Done ', claude)

    expect(replied!.messages.map((message) => [message.author.name, message.body])).toEqual([
      ['Den', 'Fix the title'],
      ['Claude', 'Done'],
    ])
    expect(replied!.messages[1]!.id).toMatch(/^m_[0-9a-z]{8}$/)
    expect(replied!.messages[1]!.id).not.toBe(replied!.messages[0]!.id)
    expect(await store.get(thread.id)).toEqual(replied)
    expect(await store.reply('c_nope', 'hello', den)).toBeNull()
  })

  it('resolves and reopens', async () => {
    const thread = await store.create({ page: '/', body: 'x' }, den)

    const resolved = await store.setStatus(thread.id, 'resolved', claude)
    expect(resolved).toMatchObject({ status: 'resolved', resolvedBy: claude })
    expect(resolved!.resolvedAt).toMatch(ISO)

    // The status it already has: nothing changes, not even who resolved it.
    const again = await store.setStatus(thread.id, 'resolved', den)
    expect(again).toEqual(resolved)

    const reopened = await store.setStatus(thread.id, 'open', den)
    expect(reopened!.status).toBe('open')
    expect(reopened).not.toHaveProperty('resolvedAt')
    expect(reopened).not.toHaveProperty('resolvedBy')
    expect(await store.get(thread.id)).toEqual(reopened)

    expect(await store.setStatus('c_nope', 'resolved', den)).toBeNull()
    await expect(store.setStatus(thread.id, 'done' as never, den)).rejects.toThrow(/status/)
  })

  it('posts the note and the new status in one write', async () => {
    const thread = await store.create({ page: '/', body: 'x' }, den)
    const file = join(mechDir, 'comments', 'comments.json')
    const writes: string[] = []
    const watcher = fs.watch(file, () => writes.push(fs.readFileSync(file, 'utf-8')))
    const resolved = await store.setStatus(thread.id, 'resolved', claude, '  Shortened it.  ')
    watcher.close()

    expect(resolved!.status).toBe('resolved')
    expect(resolved!.messages.map((message) => [message.author.name, message.body])).toEqual([
      ['Den', 'x'],
      ['Claude', 'Shortened it.'],
    ])
    // Whatever a watcher saw, it never saw the note on a still-open thread.
    for (const text of writes) {
      const seen = JSON.parse(text).threads[0]
      expect(seen.messages.length === 2 && seen.status === 'open').toBe(false)
    }
    // A note on a thread that is already resolved is still posted.
    const again = await store.setStatus(thread.id, 'resolved', den, 'One more thing')
    expect(again!.messages).toHaveLength(3)
    expect(again!.resolvedBy).toEqual(claude)
  })

  it('removes a thread', async () => {
    const a = await store.create({ page: '/', body: 'a' }, den)
    const b = await store.create({ page: '/', body: 'b' }, den)
    expect(await store.remove(a.id)).toBe(true)
    expect(await store.remove(a.id)).toBe(false)
    expect((await store.list()).map((thread) => thread.id)).toEqual([b.id])
  })

  it('moves and removes the threads of a page — that page only', async () => {
    const about = await store.create({ page: '/about', body: 'a' }, den)
    const team = await store.create({ page: '/about/team', body: 'b' }, den)
    const home = await store.create({ page: '/', body: 'c' }, den)

    await store.movePage('/about', '/company/')
    expect((await store.get(about.id))!.page).toBe('/company')
    expect((await store.get(team.id))!.page).toBe('/about/team')
    expect(await store.list({ page: '/about' })).toEqual([])

    await store.removePage('company')
    expect((await store.list()).map((thread) => thread.id)).toEqual([team.id, home.id])
  })

  it('ignores its own directory in git — once', async () => {
    const ignore = join(mechDir, 'comments', '.gitignore')
    await store.create({ page: '/', body: 'a' }, den)
    expect(fs.readFileSync(ignore, 'utf-8')).toBe('*\n')

    // A project that tracks its comments deleted the file: it stays deleted.
    fs.rmSync(ignore)
    await store.create({ page: '/', body: 'b' }, den)
    await fsCommentStore(mechDir).create({ page: '/', body: 'c' }, den)
    expect(fs.existsSync(ignore)).toBe(false)
    expect(await store.list()).toHaveLength(3)
  })

  it('treats a corrupt or foreign file as no threads, and recovers on the next write', async () => {
    fs.mkdirSync(join(mechDir, 'comments'))
    fs.writeFileSync(file(), '{ not json')
    expect(await store.list()).toEqual([])
    expect(await store.setStatus('c_1', 'resolved', den)).toBeNull()

    fs.writeFileSync(file(), JSON.stringify({ version: 1, threads: [null, 'x', { id: 'c_1' }] }))
    expect(await store.list()).toEqual([])
    fs.writeFileSync(file(), '[]')
    expect(await store.list()).toEqual([])

    const thread = await store.create({ page: '/', body: 'fresh' }, den)
    expect(onDisk()).toEqual({ version: 1, threads: [thread] })
    // The directory was there already, so no .gitignore was added.
    expect(fs.existsSync(join(mechDir, 'comments', '.gitignore'))).toBe(false)
  })

  it('keeps nothing in memory: two stores on one directory see each other', async () => {
    const other = fsCommentStore(mechDir)
    const thread = await store.create({ page: '/', body: 'from the editor' }, den)

    expect((await other.list()).map((item) => item.id)).toEqual([thread.id])
    await other.reply(thread.id, 'from the CLI', claude)
    await other.setStatus(thread.id, 'resolved', claude)
    const second = await other.create({ page: '/about', body: 'another' }, claude)

    const seen = await store.get(thread.id)
    expect(seen!.status).toBe('resolved')
    expect(seen!.messages.map((message) => message.body)).toEqual(['from the editor', 'from the CLI'])
    expect((await store.list()).map((item) => item.id)).toEqual([thread.id, second.id])
  })

  it('leaves no temp files behind', async () => {
    await store.create({ page: '/', body: 'a' }, den)
    await store.create({ page: '/', body: 'b' }, den)
    expect(fs.readdirSync(join(mechDir, 'comments')).sort()).toEqual(['.gitignore', 'comments.json'])
  })
})

describe('memoryCommentStore', () => {
  it('behaves like the file store and shares nothing with its callers', async () => {
    const initial = [
      { id: 'c_seed', page: '/', status: 'open' as const, createdAt: '2026-01-01T00:00:00.000Z', messages: [] },
    ]
    const memory = memoryCommentStore(initial)
    initial[0]!.page = '/changed'

    const listed = await memory.list()
    expect(listed.map((thread) => thread.page)).toEqual(['/'])
    listed[0]!.page = '/mutated'
    expect((await memory.get('c_seed'))!.page).toBe('/')

    const thread = await memory.create({ page: '/about', body: 'hi' }, den)
    await memory.setStatus(thread.id, 'resolved', den)
    expect((await memory.list({ page: '/about' }))[0]!.status).toBe('resolved')
    await memory.removePage('/about')
    expect((await memory.list()).map((item) => item.id)).toEqual(['c_seed'])
  })
})

describe('comment helpers', () => {
  it('normalizes page paths', () => {
    expect(normalizeCommentPage('/')).toBe('/')
    expect(normalizeCommentPage('')).toBe('/')
    expect(normalizeCommentPage(' about/ ')).toBe('/about')
    expect(normalizeCommentPage('//blog/post//')).toBe('/blog/post')
  })

  it('cleans an anchor, or refuses it', () => {
    expect(cleanCommentAnchor(null)).toBeNull()
    expect(cleanCommentAnchor({ blockId: 'a', blockType: 'hero' })).toBeNull()
    expect(cleanCommentAnchor({ blockId: 'a', blockType: 'hero', path: [] })).toBeNull()
    expect(cleanCommentAnchor({ blockId: 'a', blockType: 'hero', path: [-1] })).toBeNull()
    expect(
      cleanCommentAnchor({ blockId: 'a', blockType: 'hero', path: [1, 'start', 0], quote: 'q', x: 0.5, y: '1', field: '' }),
    ).toEqual({ blockId: 'a', blockType: 'hero', path: [1, 'start', 0], quote: 'q', x: 0.5 })
  })

  it('keeps a clicked element only in its known shape', () => {
    const base = { blockId: 'b', blockType: 'hero', path: [0] }
    expect(
      cleanCommentAnchor({
        ...base,
        element: { tag: 'H2', classes: ['hero__title', 7, 'has space', ''], text: '  Welcome  ', junk: true },
      })!.element,
    ).toEqual({ tag: 'h2', classes: ['hero__title'], text: 'Welcome' })
    expect(cleanCommentAnchor({ ...base, element: { tag: 'img' } })!.element).toEqual({ tag: 'img' })
    expect(cleanCommentAnchor({ ...base, element: { tag: '<script>' } })).not.toHaveProperty('element')
    expect(cleanCommentAnchor({ ...base, element: 'h2' })).not.toHaveProperty('element')
    expect(cleanCommentAnchor({ ...base, element: { tag: 'p', text: 'x'.repeat(500) } })!.element!.text).toHaveLength(200)
  })

  it('always names a local author', () => {
    const author = localCommentAuthor(os.tmpdir())
    expect(author.kind).toBe('user')
    expect(author.name.length).toBeGreaterThan(0)
  })
})
