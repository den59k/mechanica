import { createApp } from 'vue'
import { blocksList } from 'virtual:mechanica/blocks'
import { registerFieldSchemas, type State } from '@mechanica/shared'
import { registerBuiltinFieldEditors } from './fields/builtin'
import EditorApp from './EditorApp.vue'
import type { EditorSnapshot } from './types'
import './editor.css'

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

const save = debounce((snapshot: EditorSnapshot) => {
  void fetch(`/@mechanica/save?path=${encodeURIComponent(location.pathname)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
}, 500)

const mountPoint = document.createElement('div')
mountPoint.id = 'mechanica-editor'
document.body.appendChild(mountPoint)
document.body.classList.add('mech-editing')

const state: State = (window as { state?: State }).state ?? { content: [], data: {} }
createApp(EditorApp, {
  state,
  components: blocksList as never,
  onChange: save,
}).mount(mountPoint)
