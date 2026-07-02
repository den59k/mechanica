import { createApp } from 'vue'
import { blocksList } from 'virtual:mechanica/blocks'
import { registerFieldSchemas, type State } from '@mechanica/shared'
import { getDataEntries } from '../core/data-registry'
import { registerBuiltinFieldEditors } from './fields/builtin'
import EditorApp from './EditorApp.vue'
import type { EditorSnapshot } from './lib/types'
import { createSaveQueue } from './lib/save-queue'
import './styles/editor.scss'

/**
 * Dev-only editor entry. Injected into the page by the Vite plugin: it mounts
 * the overlay editor, which drives the live page through the bridge and
 * persists edits to the `/@mechanica` dev server.
 */
registerFieldSchemas()
registerBuiltinFieldEditors()

const dataEntries = getDataEntries()

const savePath = () => `/@mechanica/save?path=${encodeURIComponent(location.pathname)}`

// The snapshot already carries the scope buckets (site/folder/page); the dev
// server persists each to its store. The queue debounces, tracks status for
// the toolbar indicator, and keeps a failed snapshot around for retry.
const saveQueue = createSaveQueue<EditorSnapshot>({
  send: async (snapshot) => {
    const response = await fetch(savePath(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
    if (!response.ok) throw new Error(`Save failed (${response.status})`)
  },
  beacon: (snapshot) =>
    navigator.sendBeacon(savePath(), new Blob([JSON.stringify(snapshot)], { type: 'application/json' })),
})

// Leaving the page (including Vite's full reload) flushes pending edits via
// the beacon; the confirm prompt only appears when the flush can't be queued
// (e.g. saves are failing), so edits are never silently lost.
window.addEventListener('beforeunload', (event) => {
  if (saveQueue.flushOnUnload()) return
  event.preventDefault()
  event.returnValue = ''
})

/** Upload a picked file to the dev server, returning its public src. */
const uploadFile = async (file: File): Promise<{ src: string }> => {
  const response = await fetch('/@mechanica/upload', {
    method: 'POST',
    headers: { 'x-file-name': encodeURIComponent(file.name) },
    body: file,
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

const state: State = (window as { state?: State }).state ?? { content: [], data: {} }
createApp(EditorApp, {
  state,
  components: blocksList as never,
  dataEntries,
  uploadFile,
  listImages,
  onChange: (snapshot: EditorSnapshot) => saveQueue.push(snapshot),
  save: saveQueue,
}).mount(mountPoint)
