import {
  EDITOR_API_BASE,
  type ComposedBlockDefinition,
  type ComposedBlockResponse,
  type EditorCapabilities,
  type EditorHostConfig,
  type EditorPageListing,
  type EditorPageState,
  type ImageListing,
  type PageFormInput,
  type SavePageRequest,
  type SavePageResponse,
  type SaveTarget,
  type UploadResult,
} from 'mechanica-shared'
import { SaveConflictError } from './save-queue'

/**
 * The editor's one door to its host — the thing that serves the site's `.mech`
 * store (the Vite dev server, or a hosted editing service). Components and
 * entries call these methods and never build `/@mechanica/…` URLs or `fetch`
 * themselves, so pointing the editor at another host is configuration
 * (`window.__MECHANICA_EDITOR__`, see `EditorHostConfig`), not a code change.
 * The wire shapes live in `mechanica-shared`'s `editor-protocol.ts`.
 */
export interface EditorBackend {
  /** What the host offers; the UI hides what it doesn't. */
  readonly capabilities: EditorCapabilities

  pages: {
    /** Every page of the site. Rejects when the host is unreachable. */
    list(): Promise<EditorPageListing[]>
    create(input: PageFormInput): Promise<PageWriteResult>
    /** Rename and/or move the page at `path`. */
    update(path: string, input: PageFormInput): Promise<PageWriteResult>
    duplicate(path: string, input: PageFormInput): Promise<PageWriteResult>
    remove(path: string): Promise<boolean>
    setDraft(path: string, draft: boolean): Promise<boolean>
    /** Create the `locale` translation of a page; an existing one is not an error. */
    createTranslation(path: string, locale: string): Promise<void>
    /** A page's state for the editor, or null when it can't be loaded. */
    state(path: string): Promise<EditorPageState | null>
    /** Persist a page. Throws `SaveConflictError` when it changed underneath. */
    save(target: SaveTarget, body: SavePageRequest): Promise<SavePageResponse>
    /** Best-effort save while the page unloads; returns whether it was queued. */
    saveOnUnload(target: SaveTarget, body: SavePageRequest): boolean
  }

  assets: {
    upload(file: File): Promise<UploadResult>
    /** Store a cropped derivative under a caller-chosen name (kept out of the library). */
    uploadDerived(blob: Blob, name: string): Promise<{ src: string }>
    /** Images already uploaded to the site; `[]` when unavailable. */
    images(): Promise<ImageListing[]>
  }

  composed: {
    get(id: string): Promise<ComposedBlockResponse | null>
    /** Create a block. Throws `SaveConflictError` on 409, `BackendError` otherwise. */
    create(def: ComposedBlockDefinition): Promise<{ version: string | null }>
    save(id: string, def: ComposedBlockDefinition, version: string | null): Promise<{ version: string | null }>
    remove(id: string): Promise<void>
  }

  urls: {
    /** A page's thumbnail (may 404 — callers need a fallback). */
    pageThumb(path: string): string
    /** A block's palette thumbnail (may 404). */
    blockThumb(blockId: string): string
    /** The composer page for a block id (`~new` starts a fresh one). */
    composer(blockId: string): string
  }

  /**
   * Subscribe to changes made to the store behind the editor's back (a file
   * edited on disk). `path` is the changed page, absent when anything may have
   * changed. Returns an unsubscribe function; a host without live events never
   * calls back.
   */
  onStoreChange(listener: (change: { path?: string }) => void): () => void
}

/** The outcome of a page create / update / duplicate: its path, or a message for the form. */
export type PageWriteResult = { ok: true; path?: string } | { ok: false; error: string }

/** A failed request; `message` is fit for showing to the user. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

/** The server's error body: a plain message or a per-field map. */
type ErrorBody = { error?: string | Record<string, string> } | null

const errorMessage = (body: ErrorBody, field: string): string | undefined =>
  typeof body?.error === 'object' ? body.error[field] : body?.error

/** Slug shared with the thumbs CLI's `pageSlug`: `/` → `index`, `/docs/api` → `docs-api`. */
function pageSlug(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  return trimmed ? trimmed.replace(/\//g, '-') : 'index'
}

const JSON_HEADERS = { 'content-type': 'application/json' }

/** Build a backend over HTTP for a host config (all defaults = the dev server). */
export function createEditorBackend(config: EditorHostConfig = {}): EditorBackend {
  const base = (config.base ?? EDITOR_API_BASE).replace(/\/+$/, '')
  const hostHeaders = config.headers ?? {}
  const hasHostHeaders = Object.keys(hostHeaders).length > 0

  const url = (route: string, params?: Record<string, string | undefined>): string => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params ?? {})) if (value != null) query.set(key, value)
    const search = query.toString()
    return `${base}${route}${search ? `?${search}` : ''}`
  }

  // `fetch` is looked up per call (tests stub the global), and a plain GET to a
  // host without extra headers goes out as a bare `fetch(url)`.
  const request = (target: string, init?: RequestInit): Promise<Response> => {
    if (!hasHostHeaders) return init ? fetch(target, init) : fetch(target)
    return fetch(target, { ...init, headers: { ...hostHeaders, ...(init?.headers as Record<string, string>) } })
  }

  const postJson = (target: string, body: unknown): Promise<Response> =>
    request(target, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })

  const readJson = <T>(response: Response): Promise<T | null> =>
    (response.json() as Promise<T>).catch(() => null)

  const writePage = async (target: string, input: PageFormInput): Promise<PageWriteResult> => {
    const response = await postJson(target, input)
    const data = await readJson<{ path?: string } & NonNullable<ErrorBody>>(response)
    if (!response.ok) return { ok: false, error: errorMessage(data, 'path') ?? 'Could not save the page' }
    return { ok: true, path: data?.path }
  }

  const saveUrl = (target: SaveTarget) => url('/save', { path: target.path, locale: target.locale })

  const upload = async <T>(body: Blob, name: string, derived: boolean): Promise<T> => {
    const response = await request(url('/upload'), {
      method: 'POST',
      // The name is percent-encoded so spaces/unicode survive the header.
      headers: { 'x-file-name': encodeURIComponent(name), ...(derived ? { 'x-derived-asset': '1' } : {}) },
      body,
    })
    if (!response.ok) throw new BackendError(`Upload failed (${response.status})`, response.status)
    return (await response.json()) as T
  }

  const writeComposed = async (target: string, body: unknown, verb: string) => {
    const response = await postJson(target, body)
    if (response.status === 409) throw new SaveConflictError()
    if (!response.ok) {
      const message = errorMessage(await readJson<NonNullable<ErrorBody>>(response), 'id')
      throw new BackendError(message ?? `${verb} failed (${response.status})`, response.status)
    }
    const result = await readJson<{ version?: string }>(response)
    return { version: result?.version ?? null }
  }

  return {
    capabilities: { composer: true, ...config.capabilities },

    pages: {
      list: async () => (await request(url('/pages'))).json() as Promise<EditorPageListing[]>,
      create: (input) => writePage(url('/pages'), input),
      update: (path, input) => writePage(url('/pages', { path }), input),
      duplicate: (path, input) => writePage(url('/pages/duplicate', { path }), input),
      remove: async (path) => (await request(url('/pages', { path }), { method: 'DELETE' })).ok,
      setDraft: async (path, draft) => (await postJson(url('/pages/draft', { path }), { draft })).ok,
      createTranslation: async (path, locale) => {
        const response = await request(url('/pages/translation', { path, locale }), { method: 'POST' })
        // 400 = the translation already exists — fine, there is one to switch to.
        if (!response.ok && response.status !== 400) {
          throw new BackendError(`Create failed (${response.status})`, response.status)
        }
      },
      state: async (path) => {
        const response = await request(url('/state', { path }))
        return response.ok ? ((await response.json()) as EditorPageState) : null
      },
      save: async (target, body) => {
        const response = await postJson(saveUrl(target), body)
        if (response.status === 409) throw new SaveConflictError()
        if (!response.ok) throw new BackendError(`Save failed (${response.status})`, response.status)
        const result = await readJson<SavePageResponse>(response)
        return { success: true, version: result?.version ?? null }
      },
      saveOnUnload: (target, body) => {
        const payload = JSON.stringify(body)
        // A beacon can't carry headers: a host that needs them gets a keepalive
        // fetch, which also outlives the page.
        if (hasHostHeaders) {
          void request(saveUrl(target), { method: 'POST', headers: JSON_HEADERS, body: payload, keepalive: true })
          return true
        }
        return navigator.sendBeacon(saveUrl(target), new Blob([payload], { type: 'application/json' }))
      },
    },

    assets: {
      upload: async (file) => {
        const { src, previewSrc, width, height } = await upload<UploadResult>(file, file.name, false)
        return { src, previewSrc, width, height }
      },
      uploadDerived: async (blob, name) => ({ src: (await upload<{ src: string }>(blob, name, true)).src }),
      images: async () => {
        const response = await request(url('/images'))
        return response.ok ? ((await response.json()) as ImageListing[]) : []
      },
    },

    composed: {
      get: async (id) => {
        const response = await request(url('/composed/get', { id }))
        return response.ok ? ((await response.json()) as ComposedBlockResponse) : null
      },
      create: (def) => writeComposed(url('/composed/create'), def, 'Create'),
      save: (id, def, version) => writeComposed(url('/composed/save', { id }), { def, version }, 'Save'),
      remove: async (id) => {
        await request(url('/composed/delete', { id }), { method: 'POST' })
      },
    },

    urls: {
      pageThumb: (path) => `${base}/thumbs/${pageSlug(path)}.png`,
      blockThumb: (blockId) => `${base}/thumbs/blocks/${encodeURIComponent(blockId)}.png`,
      composer: (blockId) => `${base}/composer/${encodeURIComponent(blockId)}`,
    },

    onStoreChange(listener) {
      // The dev server announces `.mech` changes over Vite's HMR channel; a
      // host without it has no live events (yet).
      const hot = import.meta.hot
      if (!hot) return () => {}
      const handler = (data: { path?: string } | undefined) => listener(data ?? {})
      hot.on('mechanica:store-changed', handler)
      return () => hot.off('mechanica:store-changed', handler)
    },
  }
}

let current: EditorBackend | null = null

/**
 * The backend for this page — created on first use from the host's
 * `window.__MECHANICA_EDITOR__` config (absent → the dev server).
 */
export function editorBackend(): EditorBackend {
  if (!current) {
    const host =
      typeof window === 'undefined'
        ? undefined
        : (window as { __MECHANICA_EDITOR__?: EditorHostConfig }).__MECHANICA_EDITOR__
    current = createEditorBackend(host)
  }
  return current
}

/** Replace the backend (tests, or a host that builds its own). `null` resets to the default. */
export function setEditorBackend(backend: EditorBackend | null): void {
  current = backend
}
