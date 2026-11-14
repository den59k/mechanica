import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import type { CommentThread } from 'mechanica-shared'
import {
  createEditorService,
  memoryCommentStore,
  memoryContentFiles,
  type CommentStore,
  type EditorService,
} from '@/server'

let mechDir: string
let service: EditorService
let comments: CommentStore
let requests: Request[]

const call = (path: string, init?: RequestInit) => service.handle(new Request(`http://host${path}`, init))
const post = (path: string, body: unknown, headers?: Record<string, string>) =>
  call(path, { method: 'POST', body: JSON.stringify(body), headers })
const threadOf = async (response: Response | null) => (await response!.json()) as CommentThread
const listOf = async (path = '/comments') => (await (await call(path))!.json()) as CommentThread[]

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
  comments = memoryCommentStore()
  requests = []
  service = createEditorService(mechDir, {
    comments,
    author: (request) => {
      requests.push(request)
      return { name: request.headers.get('x-user') ?? 'Den', kind: 'user', id: 'u1' }
    },
  })
})

afterEach(() => fs.rmSync(mechDir, { recursive: true, force: true }))

describe('editor service: comments', () => {
  it('creates a thread and lists it, for the site and per page', async () => {
    const created = await post('/comments', {
      page: '/pricing',
      body: 'Too expensive',
      anchor: { blockId: 'plans', blockType: 'pricing', path: [1], viewport: 390 },
    })
    expect(created!.status).toBe(200)
    const thread = await threadOf(created)
    expect(thread).toMatchObject({
      page: '/pricing',
      status: 'open',
      anchor: { blockId: 'plans', blockType: 'pricing', path: [1], viewport: 390 },
    })
    await post('/comments', { page: '/', body: 'Home' })

    expect((await listOf()).map((item) => item.page)).toEqual(['/pricing', '/'])
    expect(await listOf('/comments?page=/pricing')).toEqual([thread])
    expect(await listOf('/comments?page=%2Fnope')).toEqual([])
  })

  it('takes the author from the host, never from the body', async () => {
    const created = await post(
      '/comments',
      { page: '/', body: 'Hi', author: { name: 'Mallory', kind: 'agent' }, status: 'resolved' },
      { 'x-user': 'Alice' },
    )
    const thread = await threadOf(created)
    expect(thread.status).toBe('open')
    expect(thread.messages[0]!.author).toEqual({ name: 'Alice', kind: 'user', id: 'u1' })

    const replied = await threadOf(
      await post('/comments/reply', { id: thread.id, body: 'Me too', author: { name: 'Mallory' } }, { 'x-user': 'Bob' }),
    )
    expect(replied.messages.map((message) => message.author.name)).toEqual(['Alice', 'Bob'])

    const resolved = await threadOf(
      await post('/comments/status', { id: thread.id, status: 'resolved', resolvedBy: { name: 'Mallory' } }, { 'x-user': 'Carol' }),
    )
    expect(resolved.resolvedBy).toMatchObject({ name: 'Carol' })
    expect(requests).toHaveLength(3)
  })

  it('answers 400 for a comment without a page, a body or a real anchor', async () => {
    expect((await post('/comments', { body: 'x' }))!.status).toBe(400)
    expect((await post('/comments', { page: '/', body: '  ' }))!.status).toBe(400)
    expect((await post('/comments', { page: '/' }))!.status).toBe(400)
    expect((await post('/comments', { page: '/', body: 'x', anchor: { blockId: 'a' } }))!.status).toBe(400)
    expect((await post('/comments', null))!.status).toBe(400)
    expect(await listOf()).toEqual([])
  })

  it('replies, and answers 404 for an unknown thread', async () => {
    const thread = await threadOf(await post('/comments', { page: '/', body: 'x' }))
    expect((await post('/comments/reply', { id: thread.id, body: '' }))!.status).toBe(400)
    expect((await post('/comments/reply', { body: 'y' }))!.status).toBe(400)
    expect((await post('/comments/reply', { id: 'c_nope', body: 'y' }))!.status).toBe(404)

    const replied = await post('/comments/reply', { id: thread.id, body: 'y' })
    expect(replied!.status).toBe(200)
    expect((await threadOf(replied)).messages.map((message) => message.body)).toEqual(['x', 'y'])
  })

  it('sets the status: 400 for a bad one, 404 for an unknown thread', async () => {
    const thread = await threadOf(await post('/comments', { page: '/', body: 'x' }))
    expect((await post('/comments/status', { id: thread.id, status: 'done' }))!.status).toBe(400)
    expect((await post('/comments/status', { id: thread.id }))!.status).toBe(400)
    expect((await post('/comments/status', { status: 'open' }))!.status).toBe(400)
    expect((await post('/comments/status', { id: 'c_nope', status: 'resolved' }))!.status).toBe(404)

    const resolved = await threadOf(await post('/comments/status', { id: thread.id, status: 'resolved' }))
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedAt).toBeTypeOf('string')
    const reopened = await threadOf(await post('/comments/status', { id: thread.id, status: 'open' }))
    expect(reopened.status).toBe('open')
    expect(reopened.resolvedAt).toBeUndefined()
  })

  it('deletes a thread', async () => {
    const thread = await threadOf(await post('/comments', { page: '/', body: 'x' }))
    expect((await call('/comments', { method: 'DELETE' }))!.status).toBe(400)
    expect(await (await call(`/comments?id=${thread.id}`, { method: 'DELETE' }))!.json()).toEqual({ success: true })
    expect(await (await call(`/comments?id=${thread.id}`, { method: 'DELETE' }))!.json()).toEqual({ success: false })
    expect(await listOf()).toEqual([])
  })

  it('leaves other methods and sub-paths to the host', async () => {
    expect(await call('/comments', { method: 'PUT' })).toBeNull()
    expect(await call('/comments/reply')).toBeNull()
    expect(await call('/comments/nope', { method: 'POST', body: '{}' })).toBeNull()
  })

  it('carries a page’s comments along when it moves, and drops them when it is deleted', async () => {
    await post('/pages', { path: '/about', name: 'About' })
    await post('/pages', { path: '/contact', name: 'Contact' })
    const about = await threadOf(await post('/comments', { page: '/about', body: 'a' }))
    const contact = await threadOf(await post('/comments', { page: '/contact', body: 'c' }))

    // A rename alone moves nothing.
    await post('/pages?path=/about', { name: 'About us' })
    expect((await comments.get(about.id))!.page).toBe('/about')

    const moved = await post('/pages?path=/about', { path: '/company/' })
    expect(await moved!.json()).toEqual({ success: true, path: '/company' })
    expect((await comments.get(about.id))!.page).toBe('/company')
    expect((await comments.get(contact.id))!.page).toBe('/contact')

    // A move that fails leaves the comments where they are.
    expect((await post('/pages?path=/company', { path: '/contact' }))!.status).toBe(400)
    expect((await comments.get(about.id))!.page).toBe('/company')

    // Deleting a page that is not there deletes no comments.
    await post('/comments', { page: '/ghost', body: 'g' })
    expect(await (await call('/pages?path=/ghost', { method: 'DELETE' }))!.json()).toEqual({ success: false })
    expect(await comments.list({ page: '/ghost' })).toHaveLength(1)

    expect(await (await call('/pages?path=/company', { method: 'DELETE' }))!.json()).toEqual({ success: true })
    expect(await comments.get(about.id)).toBeNull()
    expect(await comments.get(contact.id)).not.toBeNull()
  })
})

describe('editor service: comment defaults', () => {
  it('keeps comments in the directory, signed by the local user', async () => {
    const local = createEditorService(mechDir)
    const created = await local.handle(
      new Request('http://host/comments', { method: 'POST', body: JSON.stringify({ page: '/', body: 'x' }) }),
    )
    const thread = await threadOf(created)
    expect(thread.messages[0]!.author.kind).toBe('user')
    expect(thread.messages[0]!.author.name.length).toBeGreaterThan(0)

    const stored = JSON.parse(fs.readFileSync(join(mechDir, 'comments', 'comments.json'), 'utf-8'))
    expect(stored).toEqual({ version: 1, threads: [thread] })
    expect(fs.readFileSync(join(mechDir, 'comments', '.gitignore'), 'utf-8')).toBe('*\n')
    // Comments are not content: nothing was written among the pages.
    expect(fs.readdirSync(join(mechDir, 'pages'))).toEqual([])
  })

  it('answers 501 on every comment route when there is no store', async () => {
    const bare = createEditorService(memoryContentFiles({}))
    const request = (path: string, init?: RequestInit) => bare.handle(new Request(`http://host${path}`, init))
    const responses = [
      await request('/comments'),
      await request('/comments', { method: 'POST', body: JSON.stringify({ page: '/', body: 'x' }) }),
      await request('/comments/reply', { method: 'POST', body: '{}' }),
      await request('/comments/status', { method: 'POST', body: '{}' }),
      await request('/comments?id=c_1', { method: 'DELETE' }),
    ]
    for (const response of responses) {
      expect(response!.status).toBe(501)
      expect(await response!.json()).toEqual({ error: 'Comments are not available' })
    }
  })

  it('signs as "Anonymous" over content files with a store but no author', async () => {
    const hosted = createEditorService(memoryContentFiles({}), { comments: memoryCommentStore() })
    const created = await hosted.handle(
      new Request('http://host/comments', { method: 'POST', body: JSON.stringify({ page: '/', body: 'x' }) }),
    )
    expect((await threadOf(created)).messages[0]!.author).toEqual({ name: 'Anonymous', kind: 'user' })
  })
})
