import { createApp } from 'vue'
import { registerFieldSchemas, type ComposedBlockDefinition } from 'mechanica-shared'
import { createMechanica } from '../../core/create-mechanica'
import type { BlocksMap } from '../../core/state'
import { registerBuiltinFieldEditors } from '../fields/builtin'
import { createSaveQueue, SaveConflictError } from '../lib/save-queue'
import ComposerApp from './ComposerApp.vue'
import type { ComposerSnapshot } from './lib/composer-store'
import type { SaveController } from '../lib/types'
import '../styles/editor.scss'
import './styles/composer.scss'

/** Payload the composer dev route exposes as `window.__MECHANICA_COMPOSER__`. */
interface ComposerWindow {
  __MECHANICA_COMPOSER__?: { blockId?: string }
}

export interface MountComposerOptions {
  /** Block components (compiled + composed), keyed by id — the canvas renders with these. */
  blocks: BlocksMap
  /** Mount target selector or element. */
  target: string | Element
}

/** kebab-case an id from a display name. */
function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled-block'
  )
}

const newDefinition = (): ComposedBlockDefinition => ({ id: '', name: 'Untitled block', template: [] })

/** Upload a picked file to the dev server, returning its public src (plus
 *  dimensions + LQIP previewSrc when the server has the optional `sharp`). */
const uploadFile = async (
  file: File,
): Promise<{ src: string; previewSrc?: string; width?: number; height?: number }> => {
  const response = await fetch('/@mechanica/upload', {
    method: 'POST',
    headers: { 'x-file-name': encodeURIComponent(file.name) },
    body: file,
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)
  return (await response.json()) as { src: string; previewSrc?: string; width?: number; height?: number }
}

/** List images already uploaded under the project's `.mech/assets`. */
const listImages = async (): Promise<{ id: string; name: string; src: string }[]> => {
  const response = await fetch('/@mechanica/images')
  if (!response.ok) return []
  return (await response.json()) as { id: string; name: string; src: string }[]
}

/**
 * Mount the Block Composer. Called by the generated composer entry
 * (`virtual:mechanica/composer`). Loads the target block (or a fresh one),
 * wires a debounced save (create on first save, then optimistic-concurrency
 * updates), and mounts `ComposerApp` over the runtime block set.
 */
export async function mountComposerApp(options: MountComposerOptions): Promise<void> {
  registerFieldSchemas()
  registerBuiltinFieldEditors()

  const req = (window as ComposerWindow).__MECHANICA_COMPOSER__ ?? {}
  const requestedId = req.blockId && req.blockId !== '~new' ? req.blockId : null

  // Load the existing definition + its on-disk version, or start a fresh one.
  let currentId: string | null = requestedId
  let version: string | null = null
  let def: ComposedBlockDefinition | null = null
  if (requestedId) {
    const res = await fetch(`/@mechanica/composed/get?id=${encodeURIComponent(requestedId)}`)
    if (res.ok) {
      const data = (await res.json()) as { def: ComposedBlockDefinition; version: string }
      def = data.def
      version = data.version
    }
  }
  if (!def) def = newDefinition()

  // Site-scope data so blocks reading shared data render with real values.
  const siteState = await fetch('/@mechanica/state?path=/')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)

  const target =
    typeof options.target === 'string' ? document.querySelector(options.target) : options.target
  if (!target) throw new Error(`Composer mount target not found: ${String(options.target)}`)

  // Save pipeline: first save of a new block creates it (deriving an id from
  // the name); later saves update with optimistic concurrency (409 → conflict).
  const saveQueue = createSaveQueue<ComposerSnapshot>({
    send: async (snapshot) => {
      if (version === null) {
        const id = snapshot.id || slugify(snapshot.name)
        const res = await fetch('/@mechanica/composed/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...snapshot, id }),
        })
        if (res.status === 409) throw new SaveConflictError()
        if (!res.ok) throw new Error(`Create failed (${res.status})`)
        const result = (await res.json()) as { version?: string }
        currentId = id
        version = result.version ?? null
      } else {
        const res = await fetch(`/@mechanica/composed/save?id=${encodeURIComponent(currentId!)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ def: { ...snapshot, id: currentId }, version }),
        })
        if (res.status === 409) throw new SaveConflictError()
        if (!res.ok) throw new Error(`Save failed (${res.status})`)
        const result = (await res.json()) as { version?: string }
        version = result.version ?? version
      }
    },
  })

  const saveController: SaveController = {
    get status() {
      return saveQueue.status
    },
    retry: () => saveQueue.retry(),
  }

  window.addEventListener('beforeunload', (event) => {
    if (!saveQueue.hasUnsaved()) return
    event.preventDefault()
    event.returnValue = ''
  })

  const app = createApp(ComposerApp, {
    def,
    blocks: options.blocks,
    save: saveController,
    onChange: (snapshot: ComposerSnapshot) => saveQueue.push(snapshot),
  })
  app.use(
    createMechanica({
      mode: 'dev',
      blocks: options.blocks,
      state: { content: [], data: siteState?.data ?? {} },
    }),
  )
  // Image fields (button/image inspectors) reuse the editor's upload services.
  app.provide('mechFileUploader', uploadFile)
  app.provide('mechImageLibrary', listImages)
  app.mount(target)
}
