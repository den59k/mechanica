import { createApp, shallowRef } from 'vue'
import { blocksList } from 'virtual:mechanica/blocks'
import { composedList } from 'virtual:mechanica/composed'
import { widgetsList } from 'virtual:mechanica/widgets'
import { registerFieldSchemas, type State } from 'mechanica-shared'
import { getDataEntries } from '../core/data-registry'
import { createComposedComponent } from '../core/composed'
import { registerBuiltinFieldEditors } from './fields/builtin'
import { registerRichTextWidgets } from './fields/richtext/widgets'
import EditorApp from './EditorApp.vue'
import type { EditorSnapshot, SaveController } from './lib/types'
import { createSaveQueue, SaveConflictError } from './lib/save-queue'
import type { PageNavigation } from './lib/navigation'
import './styles/editor.scss'

/**
 * Dev-only editor entry. Injected into the page by the Vite plugin: it mounts
 * the overlay editor, which drives the live page through the bridge and
 * persists edits to the `/@mechanica` dev server.
 */
registerFieldSchemas()
registerBuiltinFieldEditors()
registerRichTextWidgets(widgetsList)

const dataEntries = getDataEntries()

const state: State = (window as { state?: State }).state ?? { content: [], data: {} }

// Saves target the page the state came from (`page.path`), not the URL: on a
// paginated variant URL (/blog/2) the state is the base page's, and saving to
// the raw pathname would silently create a page file at /blog/2.
let pagePath = state.page?.path ?? location.pathname
// On a multi-language site the state also carries the locale it was read in;
// saves ride it so a translation writes its own `<name>@<locale>.page.md` file
// (the server ignores the default locale, so this is inert on single-lang sites).
let pageLocale = state.page?.locale
const savePath = () => {
  const params = new URLSearchParams({ path: pagePath })
  if (pageLocale) params.set('locale', pageLocale)
  return `/@mechanica/save?${params}`
}

// Optimistic concurrency: saves carry the version of the page we loaded; the
// dev server rejects the save (409) when the file changed externally, so the
// editor never silently clobbers e.g. Claude's edits to the .page.md.
let pageVersion: string | null = (state as { version?: string | null }).version ?? null
let forceNextSave = false
// A programmatically generated page (plugin `generatePages`) has no file — the
// editor renders it but never queues a save (the dev server would reject it).
let readOnly = state.generated === true

// `localized` data entries: their site/folder value is translated per locale, so
// the save payload routes them to separate buckets the dev server writes to the
// locale's override file (empty set → nothing to split, single-language sites
// are unaffected).
const localizedIds = new Set(dataEntries.filter((entry) => entry.localized).map((entry) => entry.id))

/**
 * Split the editable snapshot for the wire: shared site/folder data stays in
 * `siteData`/`folderData`; `localized` entries move to `siteDataI18n`/
 * `folderDataI18n` so the server can persist them per locale.
 */
function saveBody(snapshot: EditorSnapshot): Record<string, unknown> {
  const split = (bucket: Record<string, unknown> = {}) => {
    const shared: Record<string, unknown> = {}
    const i18n: Record<string, unknown> = {}
    for (const [id, value] of Object.entries(bucket)) (localizedIds.has(id) ? i18n : shared)[id] = value
    return { shared, i18n }
  }
  const site = split(snapshot.siteData as Record<string, unknown>)
  const folder = split(snapshot.folderData as Record<string, unknown>)
  return {
    content: snapshot.content,
    pageData: snapshot.pageData,
    siteData: site.shared,
    folderData: folder.shared,
    siteDataI18n: site.i18n,
    folderDataI18n: folder.i18n,
    // Base-owned (the server ignores it on translation saves): the page's layout.
    layout: snapshot.layout ?? null,
  }
}

// The snapshot already carries the scope buckets (site/folder/page); the dev
// server persists each to its store. The queue debounces, tracks status for
// the toolbar indicator, and keeps a failed snapshot around for retry.
const saveQueue = createSaveQueue<EditorSnapshot>({
  send: async (snapshot) => {
    const force = forceNextSave
    forceNextSave = false
    const response = await fetch(savePath(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...saveBody(snapshot), version: pageVersion, force }),
    })
    if (response.status === 409) throw new SaveConflictError()
    if (!response.ok) throw new Error(`Save failed (${response.status})`)
    const result = (await response.json().catch(() => null)) as { version?: string | null } | null
    if (result?.version != null) pageVersion = result.version
  },
  beacon: (snapshot) =>
    navigator.sendBeacon(
      savePath(),
      new Blob([JSON.stringify({ ...saveBody(snapshot), version: pageVersion })], { type: 'application/json' }),
    ),
})

// Leaving the page (including Vite's full reload) flushes pending edits via
// the beacon; the confirm prompt only appears when the flush can't be queued
// (e.g. saves are failing or conflicted), so edits are never silently lost.
window.addEventListener('beforeunload', (event) => {
  if (saveQueue.flushOnUnload()) return
  event.preventDefault()
  event.returnValue = ''
})

// External changes to the `.mech` store (Claude editing the .page.md, manual
// edits) are pushed by the dev server. When the editor is clean the fresh
// state is applied in place (live sync); when it has unsaved edits we do
// nothing — the pending save hits the version check and surfaces as a conflict.
const externalState = shallowRef<State | null>(null)

const normalizePathname = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** Fetch a page's dev state and make it the editor's current state. */
async function loadState(path: string): Promise<boolean> {
  const response = await fetch(`/@mechanica/state?path=${encodeURIComponent(path)}`)
  if (!response.ok) return false
  const fresh = (await response.json()) as State & { version?: string | null }
  pageVersion = fresh.version ?? null
  pagePath = fresh.page?.path ?? path
  pageLocale = fresh.page?.locale
  readOnly = fresh.generated === true
  externalState.value = fresh
  return true
}

if (import.meta.hot) {
  import.meta.hot.on('mechanica:store-changed', (data: { path?: string } | undefined) => {
    if (data?.path && normalizePathname(data.path) !== normalizePathname(pagePath)) return
    if (saveQueue.hasUnsaved()) return
    void loadState(location.pathname)
  })
}

// In-place page switching: flush pending saves, fetch the target page's state,
// and swap it into the running editor + runtime — no full page reload. The
// browser URL is updated so saves, deep links and refreshes stay correct.
const navigation: PageNavigation = {
  path: shallowRef(location.pathname),
  async switchPage(path: string) {
    if (normalizePathname(path) === normalizePathname(location.pathname)) return true
    // Don't leave the page with unsaved (or conflicted) edits.
    if (!(await saveQueue.flush())) return false
    if (!(await loadState(path))) return false
    history.pushState({}, '', path)
    navigation.path.value = location.pathname
    // Land at the top of the new page, like a real navigation would.
    window.scrollTo(0, 0)
    return true
  },
}

// Back/forward re-load the page the URL now points at (state was pushed above).
window.addEventListener('popstate', () => {
  navigation.path.value = location.pathname
  void saveQueue.flush().then(() => loadState(location.pathname))
})

// The toolbar's save surface: status indicator, retry, and the two conflict
// resolutions (overwrite the disk, or drop local edits and reload).
const saveController: SaveController = {
  get status() {
    return saveQueue.status
  },
  retry: () => saveQueue.retry(),
  keepMine: () => {
    forceNextSave = true
    saveQueue.retry()
  },
  reloadFromDisk: () => {
    saveQueue.discard()
    location.reload()
  },
}

/** Upload response: the public src, plus dimensions + LQIP `previewSrc` when
 *  the dev server has the optional `sharp` dependency installed. */
interface UploadResult {
  src: string
  previewSrc?: string
  width?: number
  height?: number
}

/** Upload a picked file to the dev server. */
const uploadFile = async (file: File): Promise<UploadResult> => {
  const response = await fetch('/@mechanica/upload', {
    method: 'POST',
    headers: { 'x-file-name': encodeURIComponent(file.name) },
    body: file,
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)
  const { src, previewSrc, width, height } = (await response.json()) as UploadResult
  return { src, previewSrc, width, height }
}

/** Upload a cropped derivative under a deterministic name (kept out of the library). */
const uploadDerived = async (blob: Blob, name: string): Promise<{ src: string }> => {
  const response = await fetch('/@mechanica/upload', {
    method: 'POST',
    headers: { 'x-file-name': encodeURIComponent(name), 'x-derived-asset': '1' },
    body: blob,
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)
  const { src } = (await response.json()) as { src: string }
  return { src }
}

/** List images already uploaded under the project's `.mech/assets`. */
const listImages = async (): Promise<{ id: string; name: string; src: string }[]> => {
  const response = await fetch('/@mechanica/images')
  if (!response.ok) return []
  return (await response.json()) as { id: string; name: string; src: string }[]
}

const mountPoint = document.createElement('div')
mountPoint.id = 'mechanica-editor'
document.body.appendChild(mountPoint)

// Composed blocks join the palette as components carrying blockId/blockSchema,
// so they list, insert, preview and get a settings form like compiled blocks —
// and the palette can offer Edit/Delete (they carry `composed: true`).
const composedComponents = composedList.map(createComposedComponent)

createApp(EditorApp, {
  state,
  components: [...blocksList, ...composedComponents] as never,
  dataEntries,
  uploadFile,
  uploadDerived,
  listImages,
  onChange: (snapshot: EditorSnapshot) => {
    if (!readOnly) saveQueue.push(snapshot)
  },
  save: saveController,
  externalState,
  navigation,
}).mount(mountPoint)
