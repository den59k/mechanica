import { createApp } from 'vue'
import { blocksList } from 'virtual:mechanica/blocks'
import { registerFieldSchemas, type State } from '@mechanica/shared'
import { getDataEntries } from '../core/data-registry'
import { registerBuiltinFieldEditors } from './fields/builtin'
import EditorApp from './EditorApp.vue'
import type { EditorSnapshot } from './lib/types'
import './styles/editor.scss'

/**
 * Dev-only editor entry. Injected into the page by the Vite plugin: it mounts
 * the overlay editor, which drives the live page through the bridge and
 * persists edits to the `/@mechanica` dev server.
 */
registerFieldSchemas()
registerBuiltinFieldEditors()

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

const dataEntries = getDataEntries()
// Tell the dev server which scope each data id lives at, so it can split
// site-wide data out of the page file on save.
const dataScopes = Object.fromEntries(dataEntries.map((entry) => [entry.id, entry.scope ?? 'page']))

const save = debounce((snapshot: EditorSnapshot) => {
  void fetch(`/@mechanica/save?path=${encodeURIComponent(location.pathname)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...snapshot, dataScopes }),
  })
}, 500)

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
  onChange: save,
}).mount(mountPoint)
