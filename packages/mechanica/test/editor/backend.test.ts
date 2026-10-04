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
})
