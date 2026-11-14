import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { execFileSync } from 'node:child_process'
import type { CommentThread } from 'mechanica-shared'
import { PlatformError } from '@/cli/platform/api'
import type { LinkLookup, SiteLink } from '@/cli/platform/assets'
import { commentStoreFor, CommentsUnreachableError, remoteCommentStore } from '@/cli/platform/comments'
import { runComments } from '@/cli/comments'
import { fsCommentStore } from '@/server/comments-store'

const link: SiteLink = { origin: 'https://platform.test', slug: 'acme', uuid: 'u1', token: 'mch_test' }
const den = { name: 'Den', kind: 'user' as const }
const claude = { name: 'Claude', kind: 'agent' as const }

const thread = (id: string, patch: Partial<CommentThread> = {}): CommentThread => ({
  id,
  page: '/pricing',
  status: 'open',
  createdAt: '2026-11-14T10:32:05.000Z',
  messages: [{ id: `m_${id}`, author: den, body: 'Fix this', createdAt: '2026-11-14T10:32:05.000Z' }],
  ...patch,
})

interface Sent {
  method: string
  url: string
  auth: string | null
  contentType: string | null
  body: unknown
}

/** A stand-in for the platform: records every request, answers with what `answer` returns. */
function fakePlatform(answer: (sent: Sent) => { status?: number; body?: unknown; text?: string } = () => ({ body: [] })) {
  const sent: Sent[] = []
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    const request: Sent = {
      method: init.method ?? 'GET',
      url: String(input),
      auth: headers.get('authorization'),
      contentType: headers.get('content-type'),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    sent.push(request)
    const { status = 200, body, text } = answer(request)
    return new Response(text ?? JSON.stringify(body ?? null), { status })
  }) as typeof globalThis.fetch
  return { fetch, sent }
}

describe('remoteCommentStore', () => {
  it('lists the site’s threads, or one page’s', async () => {
    const threads = [thread('c_1'), thread('c_2', { page: '/' })]
    const { fetch, sent } = fakePlatform(() => ({ body: threads }))
    const store = remoteCommentStore(link, { fetch })

    expect(await store.list()).toEqual(threads)
    await store.list({ page: 'blog/first post/' })
    await store.list({ page: '/' })

    expect(sent).toEqual([
      { method: 'GET', url: 'https://platform.test/api/sites/u1/comments', auth: 'Bearer mch_test', contentType: null, body: undefined },
      {
        method: 'GET',
        url: 'https://platform.test/api/sites/u1/comments?page=%2Fblog%2Ffirst%20post',
        auth: 'Bearer mch_test',
        contentType: null,
        body: undefined,
      },
      { method: 'GET', url: 'https://platform.test/api/sites/u1/comments?page=%2F', auth: 'Bearer mch_test', contentType: null, body: undefined },
    ])
  })

  it('gets a thread by listing and finding it', async () => {
    const { fetch, sent } = fakePlatform(() => ({ body: [thread('c_1'), thread('c_2')] }))
    const store = remoteCommentStore(link, { fetch })
    expect((await store.get('c_2'))!.id).toBe('c_2')
    expect(await store.get('c_nope')).toBeNull()
    expect(sent.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET https://platform.test/api/sites/u1/comments',
      'GET https://platform.test/api/sites/u1/comments',
    ])
  })

  it('creates a thread, telling the platform only whether an agent wrote it', async () => {
    const created = thread('c_new')
    const { fetch, sent } = fakePlatform(() => ({ body: created }))
    const store = remoteCommentStore(link, { fetch })
    const anchor = { blockId: 'plans', blockType: 'pricing', path: [1, 0] }

    expect(await store.create({ page: '/pricing', body: 'Whole page' }, den)).toEqual(created)
    await store.create({ page: '/pricing', locale: 'ru', anchor, body: 'Wrong price' }, claude)

    expect(sent).toEqual([
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments',
        auth: 'Bearer mch_test',
        contentType: 'application/json',
        body: { page: '/pricing', body: 'Whole page', agent: false },
      },
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments',
        auth: 'Bearer mch_test',
        contentType: 'application/json',
        body: { page: '/pricing', locale: 'ru', anchor, body: 'Wrong price', agent: true },
      },
    ])
    // The author's name is the platform's business: it never travels.
    expect(JSON.stringify(sent)).not.toContain('Claude')
    expect(JSON.stringify(sent)).not.toContain('Den')
  })

  it('replies', async () => {
    const answered = thread('c_1')
    const { fetch, sent } = fakePlatform(() => ({ body: answered }))
    const store = remoteCommentStore(link, { fetch })

    expect(await store.reply('c_1', 'Which one?', claude)).toEqual(answered)
    await store.reply('c_1', 'This one', den)
    expect(sent.map(({ method, url, auth, body }) => ({ method, url, auth, body }))).toEqual([
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments/reply',
        auth: 'Bearer mch_test',
        body: { id: 'c_1', body: 'Which one?', agent: true },
      },
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments/reply',
        auth: 'Bearer mch_test',
        body: { id: 'c_1', body: 'This one', agent: false },
      },
    ])
  })

  it('sets a status, with the note in the same request', async () => {
    const resolved = thread('c_1', { status: 'resolved' })
    const { fetch, sent } = fakePlatform(() => ({ body: resolved }))
    const store = remoteCommentStore(link, { fetch })

    expect(await store.setStatus('c_1', 'resolved', claude, 'Changed the price')).toEqual(resolved)
    await store.setStatus('c_1', 'open', den)
    await store.setStatus('c_1', 'resolved', den, '  ')
    expect(sent.map(({ method, url, auth, body }) => ({ method, url, auth, body }))).toEqual([
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments/status',
        auth: 'Bearer mch_test',
        body: { id: 'c_1', status: 'resolved', note: 'Changed the price', agent: true },
      },
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments/status',
        auth: 'Bearer mch_test',
        body: { id: 'c_1', status: 'open', agent: false },
      },
      {
        method: 'POST',
        url: 'https://platform.test/api/sites/u1/comments/status',
        auth: 'Bearer mch_test',
        body: { id: 'c_1', status: 'resolved', agent: false },
      },
    ])
  })

  it('answers null for a thread the platform does not have', async () => {
    const { fetch } = fakePlatform(() => ({ status: 404, body: { error: 'not found' } }))
    const store = remoteCommentStore(link, { fetch })
    expect(await store.reply('c_nope', 'Hi', den)).toBeNull()
    expect(await store.setStatus('c_nope', 'resolved', den)).toBeNull()
  })

  it('removes a thread', async () => {
    let success = true
    const { fetch, sent } = fakePlatform(() => ({ body: { success } }))
    const store = remoteCommentStore(link, { fetch })
    expect(await store.remove('c 1')).toBe(true)
    success = false
    expect(await store.remove('c_nope')).toBe(false)
    expect(sent[0]).toEqual({
      method: 'DELETE',
      url: 'https://platform.test/api/sites/u1/comments?id=c%201',
      auth: 'Bearer mch_test',
      contentType: null,
      body: undefined,
    })
  })

  it('leaves page moves and deletions to the platform', async () => {
    const { fetch, sent } = fakePlatform()
    const store = remoteCommentStore(link, { fetch })
    await store.movePage('/a', '/b')
    await store.removePage('/a')
    expect(sent).toEqual([])
  })

  it('surfaces the platform’s message for any other failure', async () => {
    const { fetch } = fakePlatform(({ method }) =>
      method === 'GET' ? { status: 403, text: 'You are not a member of this site' } : { status: 400, body: { error: 'A comment needs some text' } },
    )
    const store = remoteCommentStore(link, { fetch })

    const refused = await store.list().catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(PlatformError)
    expect(refused).toMatchObject({ status: 403, message: 'You are not a member of this site' })
    await expect(store.get('c_1')).rejects.toThrow('You are not a member of this site')
    await expect(store.create({ page: '/', body: '' }, den)).rejects.toThrow('A comment needs some text')
    await expect(store.reply('c_1', '', den)).rejects.toMatchObject({ status: 400 })
    await expect(store.setStatus('c_1', 'open', den)).rejects.toThrow('A comment needs some text')
    await expect(store.remove('c_1')).rejects.toBeInstanceOf(PlatformError)

    // A 404 on the list is not "no such thread": it is a failure like any other.
    const old = remoteCommentStore(link, { fetch: fakePlatform(() => ({ status: 404, text: 'Not found' })).fetch })
    await expect(old.list()).rejects.toMatchObject({ status: 404 })

    const offline = remoteCommentStore(link, {
      fetch: (async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }) as typeof globalThis.fetch,
    })
    await expect(offline.list()).rejects.toThrow(/Could not reach https:\/\/platform\.test/)
  })
})

describe('commentStoreFor', () => {
  let cwd: string
  beforeEach(() => {
    cwd = fs.mkdtempSync(join(os.tmpdir(), 'mech-comment-store-'))
  })
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }))

  const localThreads = () => fsCommentStore(join(cwd, '.mech')).list()
  const linked = async (): Promise<LinkLookup> => ({ state: 'linked', link })
  const offline = (async () => {
    throw new Error('ECONNREFUSED')
  }) as typeof globalThis.fetch

  it('is the platform’s store for a linked project, resolved once and only when used', async () => {
    const { fetch, sent } = fakePlatform(({ method }) => ({ body: method === 'GET' ? [thread('c_1')] : thread('c_new') }))
    const lookupLink = vi.fn(linked)
    const store = commentStoreFor(cwd, { lookupLink, fetch })
    // Creating it asks nothing.
    expect(lookupLink).not.toHaveBeenCalled()
    expect(sent).toEqual([])

    // Used from several places at once, it still resolves a single time.
    const [source, threads] = await Promise.all([store.describe(), store.list({ page: '/pricing' })])
    expect(source).toEqual({ kind: 'platform', origin: 'https://platform.test', slug: 'acme' })
    expect(threads.map((item) => item.id)).toEqual(['c_1'])
    await store.create({ page: '/pricing', body: 'Hello' }, claude)
    expect(await store.describe()).toEqual(source)

    expect(lookupLink).toHaveBeenCalledTimes(1)
    expect(lookupLink).toHaveBeenCalledWith(cwd)
    expect(sent.map((request) => `${request.method} ${request.url}`)).toEqual([
      // The probe: does the platform have comments?
      'GET https://platform.test/api/sites/u1/comments',
      'GET https://platform.test/api/sites/u1/comments?page=%2Fpricing',
      'POST https://platform.test/api/sites/u1/comments',
    ])
    expect(sent[2]!.body).toEqual({ page: '/pricing', body: 'Hello', agent: true })
    // Nothing was written here.
    expect(fs.existsSync(join(cwd, '.mech'))).toBe(false)
  })

  it('is the local file for a project that is not linked (or not logged in)', async () => {
    const { fetch, sent } = fakePlatform()
    const lookupLink = vi.fn(async (): Promise<LinkLookup> => ({ state: 'none' }))
    const store = commentStoreFor(cwd, { lookupLink, fetch })

    const created = await store.create({ page: 'pricing', body: 'Local one' }, den)
    expect(await store.describe()).toEqual({ kind: 'local' })
    expect(await store.get(created.id)).toMatchObject({ page: '/pricing' })
    expect((await localThreads()).map((item) => item.id)).toEqual([created.id])
    expect(sent).toEqual([])
    expect(lookupLink).toHaveBeenCalledTimes(1)
  })

  it('is the local file when the platform predates comments', async () => {
    const { fetch, sent } = fakePlatform(() => ({ status: 404, text: 'Not found' }))
    const store = commentStoreFor(cwd, { lookupLink: linked, fetch })

    expect(await store.describe()).toEqual({ kind: 'local' })
    const created = await store.create({ page: '/pricing', body: 'Local one' }, den)
    expect(await store.reply(created.id, 'And a reply', den)).toMatchObject({ id: created.id })
    expect(await store.setStatus(created.id, 'resolved', den)).toMatchObject({ status: 'resolved' })
    await store.movePage('/pricing', '/plans')
    expect((await localThreads())[0]).toMatchObject({ page: '/plans', status: 'resolved' })
    expect(await store.remove(created.id)).toBe(true)
    await store.removePage('/plans')
    // Asked once; the answer holds for the life of the store.
    expect(sent).toHaveLength(1)
  })

  it('is the local file when the link cannot be looked up, or something else answers', async () => {
    const broken = commentStoreFor(cwd, {
      lookupLink: async () => {
        throw new Error('git is not installed')
      },
    })
    expect(await broken.describe()).toEqual({ kind: 'local' })
    expect(await broken.list()).toEqual([])

    // Something that is not the comments API answered (an HTML page, say).
    const html = fakePlatform(() => ({ text: '<!doctype html>' }))
    expect(await commentStoreFor(cwd, { lookupLink: linked, fetch: html.fetch }).describe()).toEqual({ kind: 'local' })
  })

  it('rejects while a linked project’s platform does not answer — never the local file — and asks again', async () => {
    const platform = fakePlatform(({ method }) => ({ body: method === 'GET' ? [thread('c_1')] : thread('c_1', { status: 'resolved' }) }))
    let fetch = offline
    const lookupLink = vi.fn(linked)
    const store = commentStoreFor(cwd, { lookupLink, fetch: (...args) => fetch(...args) })

    const refused = await store.list().catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(CommentsUnreachableError)
    expect(refused).toMatchObject({ status: 0 })
    expect((refused as Error).message).toMatch(/^Could not reach https:\/\/platform\.test \(ECONNREFUSED\)\. This project’s comments are kept on https:\/\/platform\.test \(acme\)/)
    expect((refused as Error).message).toContain('--local')
    // The writes an agent makes are refused too, not put in a file nobody reads.
    await expect(store.setStatus('c_1', 'resolved', claude, 'Done')).rejects.toBeInstanceOf(CommentsUnreachableError)
    await expect(store.create({ page: '/pricing', body: 'Hello' }, claude)).rejects.toBeInstanceOf(CommentsUnreachableError)
    // It still knows whose comments these are — and never names the token.
    expect(await store.describe()).toEqual({ kind: 'platform', origin: 'https://platform.test', slug: 'acme' })
    // A page moved or deleted meanwhile is not held up.
    await store.movePage('/a', '/b')
    await store.removePage('/a')
    expect(fs.existsSync(join(cwd, '.mech'))).toBe(false)

    // The platform is back: the same store finds it, and from then on keeps the answer.
    fetch = platform.fetch
    const asked = lookupLink.mock.calls.length
    expect((await store.list()).map((item) => item.id)).toEqual(['c_1'])
    expect(await store.setStatus('c_1', 'resolved', claude, 'Done')).toMatchObject({ status: 'resolved' })
    expect(lookupLink).toHaveBeenCalledTimes(asked + 1)
  })

  it('treats a platform that breaks while answering, or cannot be asked about the link, the same way', async () => {
    const down = fakePlatform(() => ({ status: 502, text: 'Bad gateway' }))
    const store = commentStoreFor(cwd, { lookupLink: linked, fetch: down.fetch })
    await expect(store.list()).rejects.toBeInstanceOf(CommentsUnreachableError)
    await expect(store.list()).rejects.toMatchObject({ status: 502 })
    // Asked each time: an outage is not remembered.
    expect(down.sent).toHaveLength(2)

    const { fetch, sent } = fakePlatform(() => ({ body: [thread('c_1')] }))
    let lookup: LinkLookup = {
      state: 'unreachable',
      origin: 'https://platform.test',
      slug: 'acme',
      error: new PlatformError(0, 'Could not reach https://platform.test (ENOTFOUND)'),
    }
    const unknown = commentStoreFor(cwd, { lookupLink: async () => lookup, fetch })
    await expect(unknown.get('c_1')).rejects.toThrow(/Could not reach .* kept on https:\/\/platform\.test \(acme\)/)
    expect(await unknown.describe()).toEqual({ kind: 'platform', origin: 'https://platform.test', slug: 'acme' })
    expect(sent).toEqual([])
    lookup = { state: 'linked', link }
    expect((await unknown.get('c_1'))!.id).toBe('c_1')
    expect(fs.existsSync(join(cwd, '.mech'))).toBe(false)
  })

  it('stays with the platform when it has comments but refuses — the refusal is shown, not hidden in a file', async () => {
    const { fetch } = fakePlatform(() => ({ status: 403, text: 'You are not a member of this site' }))
    const store = commentStoreFor(cwd, { lookupLink: linked, fetch })
    expect(await store.describe()).toMatchObject({ kind: 'platform' })
    await expect(store.list()).rejects.toThrow('You are not a member of this site')
    expect(fs.existsSync(join(cwd, '.mech'))).toBe(false)
  })
})

// A linked project and a stand-in for the platform, end to end: the real link
// resolution (the git remote, the saved token) and real requests.
describe('mechanica comments in a linked project', () => {
  let cwd: string
  let server: Server
  let origin: string
  let threads: CommentThread[]
  let requests: string[]
  let bodies: unknown[]
  let out: string[]
  const log = (text: string) => void out.push(text)

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' }, stdio: 'pipe' }).toString()

  beforeEach(async () => {
    threads = [thread('c_online', { messages: [{ id: 'm_1', author: { name: 'Ann', kind: 'user' }, body: 'Made online', createdAt: '2026-11-14T10:32:05.000Z' }] })]
    requests = []
    bodies = []
    out = []
    server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://platform')
      requests.push(`${req.method} ${url.pathname}${url.search}`)
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      }
      if (req.headers.authorization !== 'Bearer mch_test') return send(403, 'Access token is not valid')
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
        if (body) bodies.push(body)
        if (url.pathname === '/api/sites') return send(200, [{ uuid: 'u1', slug: 'acme', name: 'Acme', role: 'owner', gitUrl: '' }])
        if (url.pathname === '/api/sites/u1/comments' && req.method === 'GET') {
          const page = url.searchParams.get('page')
          return send(200, threads.filter((item) => !page || item.page === page))
        }
        if (url.pathname === '/api/sites/u1/comments/status' && req.method === 'POST') {
          const found = threads.find((item) => item.id === body.id)
          if (!found) return send(404, { error: 'not found' })
          found.status = body.status
          return send(200, found)
        }
        send(404, 'Not found')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    origin = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`

    cwd = fs.mkdtempSync(join(os.tmpdir(), 'mech-comments-linked-'))
    git('init', '--quiet', '--initial-branch=main')
    git('remote', 'add', 'mechanica', `${origin}/git/acme.git`)
    vi.stubEnv('MECHANICA_TOKEN', 'mch_test')
    fs.mkdirSync(join(cwd, '.mech/pages'), { recursive: true })
    fs.writeFileSync(join(cwd, '.mech/pages/pricing.page.md'), '::: hero #top\n:::\n')
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    fs.rmSync(cwd, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('reads and answers the site’s comments, and says where they are from', async () => {
    await runComments([], { cwd, log, env: {} })
    expect(out[0]!.split('\n')[0]).toBe(`# Review comments — 1 open on 1 page · from ${origin} (acme)`)
    expect(out[0]).toContain('### c_online · Ann · 2026-11-14 10:32')
    expect(out[0]).toContain('Whole page — `.mech/pages/pricing.page.md`')

    out = []
    await runComments(['resolve', 'c_online'], { cwd, log, env: { CLAUDECODE: '1' }, note: 'Done' })
    expect(out).toEqual(['Resolved c_online'])
    expect(bodies).toEqual([{ id: 'c_online', status: 'resolved', note: 'Done', agent: true }])

    out = []
    await runComments([], { cwd, log, env: {}, page: '/pricing' })
    expect(out).toEqual([`No open comments on /pricing · from ${origin} (acme).`])
    // Nothing was written into the project.
    expect(fs.existsSync(join(cwd, '.mech/comments'))).toBe(false)
  })

  it('--local works on the project’s own file and asks the platform nothing', async () => {
    await runComments(['add', '/pricing', 'A local note'], { cwd, log, env: {}, as: 'Den', local: true })
    out = []
    await runComments([], { cwd, log, env: {}, local: true })
    expect(out[0]!.split('\n')[0]).toBe('# Review comments — 1 open on 1 page')
    expect(out[0]).toContain('> A local note')
    expect(out[0]).not.toContain('c_online')
    expect(requests).toEqual([])
    expect(threads).toHaveLength(1)
  })

  it('says so when the site cannot be reached, and leaves the local file alone', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await expect(runComments([], { cwd, log, env: {} })).rejects.toThrow(/Could not reach .*\(acme\).*--local/)
    await expect(runComments(['resolve', 'c_online'], { cwd, log, env: {}, note: 'Done' })).rejects.toThrow(/Could not reach/)
    expect(out).toEqual([])
    expect(fs.existsSync(join(cwd, '.mech/comments'))).toBe(false)

    await runComments([], { cwd, log, env: {}, local: true })
    expect(out).toEqual(['No open comments.'])
  })

  it('falls back to the local file for a project that is not linked', async () => {
    git('remote', 'remove', 'mechanica')
    await runComments([], { cwd, log, env: {} })
    expect(out).toEqual(['No open comments.'])
    expect(requests).toEqual([])
  })
})
