import { describe, it, expect, vi, afterEach } from 'vitest'
import { BackendError, createEditorBackend } from '@/editor/lib/backend'
import { SaveConflictError } from '@/editor/lib/save-queue'

/** A minimal Response stand-in. */
const reply = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

const saveBody = {
  content: [],
  pageData: {},
  siteData: {},
  folderData: {},
  siteDataI18n: {},
  folderDataI18n: {},
}

describe('createEditorBackend', () => {
  it('talks to the dev server by default', async () => {
    const fetchMock = stubFetch(() => reply([{ path: '/', name: 'Home' }]))
    const backend = createEditorBackend()

    expect(await backend.pages.list()).toEqual([{ path: '/', name: 'Home' }])
    // A plain GET stays a bare fetch(url) — nothing to add.
    expect(fetchMock).toHaveBeenCalledWith('/@mechanica/pages')
    expect(backend.capabilities.composer).toBe(true)
    expect(backend.urls.pageThumb('/')).toBe('/@mechanica/thumbs/index.png')
    expect(backend.urls.pageThumb('/docs/api')).toBe('/@mechanica/thumbs/docs-api.png')
    expect(backend.urls.blockThumb('hero banner')).toBe('/@mechanica/thumbs/blocks/hero%20banner.png')
    expect(backend.urls.composer('~new')).toBe('/@mechanica/composer/~new')
  })

  it('applies the host config: base, headers and capabilities', async () => {
    const fetchMock = stubFetch(() => reply({ success: true, version: 'v2' }))
    const backend = createEditorBackend({
      base: '/edit-api/',
      headers: { authorization: 'Bearer t' },
      capabilities: { composer: false },
    })

    await backend.pages.save({ path: '/about', locale: 'ru' }, { ...saveBody, version: 'v1' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/edit-api/save?path=%2Fabout&locale=ru')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    })
    expect(JSON.parse(init!.body as string).version).toBe('v1')
    expect(backend.capabilities.composer).toBe(false)
    expect(backend.urls.composer('hero')).toBe('/edit-api/composer/hero')
  })

  it('saves: returns the new version, maps 409 to a conflict and other failures to an error', async () => {
    const backend = createEditorBackend()

    stubFetch(() => reply({ success: true, version: 'v2' }))
    expect(await backend.pages.save({ path: '/' }, saveBody)).toEqual({ success: true, version: 'v2' })

    stubFetch(() => reply({ error: 'conflict' }, 409))
    await expect(backend.pages.save({ path: '/' }, saveBody)).rejects.toBeInstanceOf(SaveConflictError)

    stubFetch(() => reply({ error: 'boom' }, 500))
    await expect(backend.pages.save({ path: '/' }, saveBody)).rejects.toBeInstanceOf(BackendError)
  })

  it('page writes resolve to the path or the form error', async () => {
    const backend = createEditorBackend()

    const fetchMock = stubFetch(() => reply({ success: true, path: '/start' }))
    expect(await backend.pages.update('/', { name: 'Home', path: '/start' })).toEqual({ ok: true, path: '/start' })
    expect(fetchMock.mock.calls[0]![0]).toBe('/@mechanica/pages?path=%2F')

    stubFetch(() => reply({ error: { path: 'Page already exists' } }, 400))
    expect(await backend.pages.create({ name: 'Dup', path: '/about' })).toEqual({
      ok: false,
      error: 'Page already exists',
    })
    expect(await backend.pages.duplicate('/about', { name: 'Dup', path: '/about' })).toMatchObject({ ok: false })
  })

  it('treats an existing translation as created', async () => {
    const backend = createEditorBackend()
    stubFetch(() => reply({ error: 'Translation already exists' }, 400))
    await expect(backend.pages.createTranslation('/about', 'ru')).resolves.toBeUndefined()

    stubFetch(() => reply({}, 500))
    await expect(backend.pages.createTranslation('/about', 'ru')).rejects.toBeInstanceOf(BackendError)
  })

  it('page state is null when the host cannot serve it', async () => {
    const backend = createEditorBackend()
    stubFetch(() => reply({}, 404))
    expect(await backend.pages.state('/missing')).toBeNull()
  })

  it('uploads carry the encoded file name, derived ones the marker header', async () => {
    const fetchMock = stubFetch(() => reply({ src: '/@mechanica/assets/a.png', width: 4, extra: 1 }))
    const backend = createEditorBackend()

    const file = { name: 'мой файл.png' } as File
    expect(await backend.assets.upload(file)).toEqual({
      src: '/@mechanica/assets/a.png',
      previewSrc: undefined,
      width: 4,
      height: undefined,
    })
    expect(fetchMock.mock.calls[0]![1]!.headers).toEqual({ 'x-file-name': encodeURIComponent('мой файл.png') })

    await backend.assets.uploadDerived({} as Blob, 'a.crop-1.webp')
    expect(fetchMock.mock.calls[1]![1]!.headers).toEqual({
      'x-file-name': 'a.crop-1.webp',
      'x-derived-asset': '1',
    })
  })

  it('composed writes surface the server message and conflicts', async () => {
    const backend = createEditorBackend()
    const def = { id: 'hero', name: 'Hero', template: [] }

    stubFetch(() => reply({ success: true, version: 'c1' }))
    expect(await backend.composed.create(def)).toEqual({ version: 'c1' })

    stubFetch(() => reply({ error: { id: 'A block with this id already exists' } }, 400))
    await expect(backend.composed.create(def)).rejects.toThrow('A block with this id already exists')

    stubFetch(() => reply({ error: 'conflict' }, 409))
    await expect(backend.composed.save('hero', def, 'c1')).rejects.toBeInstanceOf(SaveConflictError)
  })

  it('has no live events outside a dev server', () => {
    const unsubscribe = createEditorBackend().onStoreChange(() => {})
    expect(unsubscribe).toBeTypeOf('function')
    unsubscribe()
  })

  const thread = {
    id: 'c1',
    page: '/pricing',
    status: 'open',
    createdAt: '2026-11-14T10:00:00.000Z',
    messages: [{ id: 'm1', author: { name: 'Den', kind: 'user' }, body: 'Too tight', createdAt: '2026-11-14T10:00:00.000Z' }],
  }

  it('lists comments for a page or the whole site; a host without them answers null', async () => {
    const backend = createEditorBackend()

    const fetchMock = stubFetch(() => reply([thread]))
    expect(await backend.comments.list('/pricing')).toEqual([thread])
    expect(fetchMock).toHaveBeenCalledWith('/@mechanica/comments?page=%2Fpricing')
    await backend.comments.list()
    expect(fetchMock).toHaveBeenLastCalledWith('/@mechanica/comments')

    stubFetch(() => reply({ error: 'Not implemented' }, 501))
    expect(await backend.comments.list('/pricing')).toBeNull()
    stubFetch(() => reply({}, 404))
    expect(await backend.comments.list('/pricing')).toBeNull()
    // Not a list (an SPA fallback answering 200) is no comments either.
    stubFetch(() => reply({ html: true }))
    expect(await backend.comments.list('/pricing')).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await backend.comments.list('/pricing')).toBeNull()
  })

  it('comment writes send the wire shapes and return the thread the host answers with', async () => {
    const backend = createEditorBackend()
    const fetchMock = stubFetch(() => reply(thread))
    const sent = (call: number) => {
      const [url, init] = fetchMock.mock.calls[call]!
      return { url, method: init!.method, body: init!.body ? JSON.parse(init!.body as string) : undefined }
    }

    const input = { page: '/pricing', anchor: { blockId: 'b1', blockType: 'pricing', path: [0], x: 0.5, y: 0.25 }, body: 'Too tight' }
    expect(await backend.comments.create(input)).toEqual(thread)
    expect(sent(0)).toEqual({ url: '/@mechanica/comments', method: 'POST', body: input })

    expect(await backend.comments.reply('c1', 'Fixed')).toEqual(thread)
    expect(sent(1)).toEqual({ url: '/@mechanica/comments/reply', method: 'POST', body: { id: 'c1', body: 'Fixed' } })

    expect(await backend.comments.setStatus('c1', 'resolved')).toEqual(thread)
    expect(sent(2)).toEqual({
      url: '/@mechanica/comments/status',
      method: 'POST',
      body: { id: 'c1', status: 'resolved' },
    })

    stubFetch(() => reply({ success: true }))
    expect(await backend.comments.remove('c1')).toBe(true)
    const removeMock = stubFetch(() => reply({ success: false }))
    expect(await backend.comments.remove('c 2')).toBe(false)
    expect(removeMock).toHaveBeenCalledWith('/@mechanica/comments?id=c+2', { method: 'DELETE' })
  })

  it('comment writes fail with a BackendError carrying a showable message', async () => {
    const backend = createEditorBackend()

    stubFetch(() => reply({ error: 'Unknown thread' }, 404))
    await expect(backend.comments.reply('nope', 'Hi')).rejects.toThrow('Unknown thread')
    await expect(backend.comments.setStatus('nope', 'open')).rejects.toBeInstanceOf(BackendError)
    await expect(backend.comments.remove('nope')).rejects.toThrow('Unknown thread')

    stubFetch(() => reply({ error: { body: 'A comment needs some text' } }, 400))
    await expect(backend.comments.create({ page: '/', body: '' })).rejects.toThrow('A comment needs some text')

    stubFetch(() => reply({}, 501))
    await expect(backend.comments.create({ page: '/', body: 'Hi' })).rejects.toThrow('Comment failed (501)')

    // An unreachable host is a BackendError too, never a raw TypeError.
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(backend.comments.create({ page: '/', body: 'Hi' })).rejects.toBeInstanceOf(BackendError)
    await expect(backend.comments.remove('c1')).rejects.toBeInstanceOf(BackendError)
  })

  it('has no live comment events outside a dev server', () => {
    const unsubscribe = createEditorBackend().onCommentsChange(() => {})
    expect(unsubscribe).toBeTypeOf('function')
    unsubscribe()
  })
})
