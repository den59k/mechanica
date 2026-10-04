import { createApp } from 'vue'
import { unfoldSchema } from 'compact-json-schema'
import {
  registerFieldSchemas,
  type Block,
  type ComposedBlockDefinition,
  type ComposerClassDef,
} from 'mechanica-shared'
import { createMechanica } from '../../core/create-mechanica'
import type { BlocksMap } from '../../core/state'
import { registerBuiltinFieldEditors } from '../fields/builtin'
import { toBlockMeta, type BlockComponent } from '../lib/block-meta'
import { createSaveQueue } from '../lib/save-queue'
import { editorBackend } from '../lib/backend'
import ComposerApp from './ComposerApp.vue'
import type { ComposerSnapshot } from './lib/composer-store'
import type { SaveController } from '../lib/types'
import '../styles/editor.scss'
import './styles/composer.scss'

/** Payload the composer dev route exposes as `window.__MECHANICA_COMPOSER__`. */
interface ComposerWindow {
  __MECHANICA_COMPOSER__?: { blockId?: string }
}

/** A raw components-manifest entry, as `virtual:mechanica/components` exposes it. */
export interface ComposerComponentDef {
  id: string
  name?: string
  icon?: string
  props?: Record<string, unknown>
  previewData?: Record<string, unknown>
  /** Set on string entries: the compiled block id being re-exposed. */
  ref?: string
}

export interface MountComposerOptions {
  /** Block components (compiled + composed + site components), keyed by id — the canvas renders with these. */
  blocks: BlocksMap
  /** The site's design-system components (from the manifest) offered in the palette. */
  components?: ComposerComponentDef[]
  /** The site's design-system CSS classes, offered as element Style (normalized). */
  classDefs?: ComposerClassDef[]
  /** The site's element breakpoints (max-widths, px) for the device switcher. */
  breakpoints?: { md: number; sm: number }
  /** Mount target selector or element. */
  target: string | Element
}

/** Convert a manifest entry to the `Block`-shaped metadata the palette/inspector use. */
function componentToBlock(def: ComposerComponentDef, blocks: BlocksMap): Block | null {
  if (def.ref) {
    const component = blocks.get(def.ref)
    return component ? toBlockMeta(component as BlockComponent) : null
  }
  return {
    id: def.id,
    name: def.name ?? def.id,
    icon: def.icon,
    previewData: def.previewData,
    props: def.props
      ? (unfoldSchema(def.props as never) as Record<string, unknown>)
      : { type: 'object', properties: {} },
  }
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

/**
 * Mount the Block Composer. Called by the generated composer entry
 * (`virtual:mechanica/composer`). Loads the target block (or a fresh one),
 * wires a debounced save (create on first save, then optimistic-concurrency
 * updates), and mounts `ComposerApp` over the runtime block set.
 */
export async function mountComposerApp(options: MountComposerOptions): Promise<void> {
  registerFieldSchemas()
  registerBuiltinFieldEditors()
  const backend = editorBackend()

  const req = (window as ComposerWindow).__MECHANICA_COMPOSER__ ?? {}
  const requestedId = req.blockId && req.blockId !== '~new' ? req.blockId : null

  // Load the existing definition + its on-disk version, or start a fresh one.
  let currentId: string | null = requestedId
  let version: string | null = null
  let def: ComposedBlockDefinition | null = null
  if (requestedId) {
    const data = await backend.composed.get(requestedId)
    if (data) {
      def = data.def
      version = data.version
    }
  }
  if (!def) def = newDefinition()

  // Site-scope data so blocks reading shared data render with real values.
  const siteState = await backend.pages.state('/').catch(() => null)

  const target =
    typeof options.target === 'string' ? document.querySelector(options.target) : options.target
  if (!target) throw new Error(`Composer mount target not found: ${String(options.target)}`)

  // The site's design-system components (from `src/composer.ts`) are the
  // composer's "real" building material — the developer-authored half of the
  // designer↔developer bridge.
  const codeBlocks: Block[] = []
  for (const def of options.components ?? []) {
    const meta = componentToBlock(def, options.blocks)
    if (meta) codeBlocks.push(meta)
  }

  // Save pipeline: first save of a new block creates it (deriving an id from
  // the name); later saves update with optimistic concurrency (409 → conflict).
  const saveQueue = createSaveQueue<ComposerSnapshot>({
    send: async (snapshot) => {
      if (version === null) {
        const id = snapshot.id || slugify(snapshot.name)
        const result = await backend.composed.create({ ...snapshot, id })
        currentId = id
        version = result.version
      } else {
        const result = await backend.composed.save(currentId!, { ...snapshot, id: currentId! }, version)
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
    codeBlocks,
    classDefs: options.classDefs ?? [],
    breakpoints: options.breakpoints,
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
  app.provide('mechFileUploader', backend.assets.upload)
  app.provide('mechDerivedUploader', backend.assets.uploadDerived)
  app.provide('mechImageLibrary', backend.assets.images)
  app.mount(target)
}
