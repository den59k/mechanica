import { createApp, defineComponent, h, type App, type Component } from 'vue'
import { unfoldSchema } from 'compact-json-schema'
import {
  areFieldSchemasRegistered,
  buildPreviewData,
  registerFieldSchemas,
  type ContentBlock,
} from 'mechanica-shared'
import { createMechanica } from './create-mechanica'
import { renderBlocks } from './render-blocks'
import type { BlocksMap } from './state'

/** The payload the dev preview route injects as `window.__MECHANICA_PREVIEW__`. */
export interface BlockPreviewRequest {
  blockId?: string
  /** Prop overrides merged over the block's `previewData` and schema defaults. */
  data?: Record<string, unknown>
}

/** A child block placed into a slot via `previewData.$slots`. */
export interface PreviewSlotEntry {
  blockId: string
  /** Prop overrides for this child (merged over its own previewData/defaults). */
  data?: Record<string, unknown>
  /** Slot content for this child, overriding the child's own `$slots`. */
  slots?: Record<string, PreviewSlotEntry[]>
}

/**
 * Globals the preview page exposes for headless tooling (`mechanica shot`):
 * the request, a readiness flag (fonts and images settled), and any error.
 */
interface PreviewWindow {
  __MECHANICA_PREVIEW__?: BlockPreviewRequest
  __MECHANICA_PREVIEW_READY__?: boolean
  __MECHANICA_PREVIEW_ERROR__?: string
}

/** Authored `$slots` never nest deeper than this — guards against cycles. */
const MAX_SLOT_DEPTH = 4

const SLOT_PLACEHOLDER_ID = '__mechanica-slot-placeholder__'

/** What an unfilled slot renders as in previews: a labelled dashed box. */
const SlotPlaceholder = defineComponent({
  name: 'MechanicaSlotPlaceholder',
  props: { slotName: { type: String, default: 'default' } },
  render() {
    return h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '96px',
          padding: '16px',
          border: '2px dashed #d0d5dd',
          borderRadius: '8px',
          color: '#98a2b3',
          font: '13px/1.4 system-ui, sans-serif',
        },
      },
      `slot: ${this.slotName}`,
    )
  },
})

export interface PreviewContent {
  /** The root content node, slots filled with `$slots` children or placeholders. */
  content: ContentBlock
  /** The block set to render with — the input map plus the slot placeholder. */
  blocks: BlocksMap
}

/**
 * Build the content tree a block renders with outside a page. Props come from
 * schema defaults ← `previewData` ← `overrides`; each slot declared by the
 * block is filled with the authored `previewData.$slots` children (recursively,
 * each child resolving its own preview data) or a labelled placeholder box.
 * Returns `null` when the block id is unknown.
 */
export function buildPreviewContent(
  blocks: BlocksMap,
  blockId: string,
  overrides?: Record<string, unknown>,
): PreviewContent | null {
  // The standalone preview route runs without the editor entry, which is what
  // normally registers the field aliases — without them `unfoldSchema` can't
  // expand `'image'`/`'smartLink'` props and their defaults degrade to ''.
  if (!areFieldSchemasRegistered()) registerFieldSchemas()
  if (!blocks.get(blockId)) return null
  const map: BlocksMap = new Map(blocks)
  map.set(SLOT_PLACEHOLDER_ID, SlotPlaceholder as Component)
  const content = buildBlock(map, blockId, overrides, 'preview', MAX_SLOT_DEPTH)
  return content ? { content, blocks: map } : null
}

function buildBlock(
  map: BlocksMap,
  blockId: string,
  overrides: Record<string, unknown> | undefined,
  id: string,
  depth: number,
): ContentBlock | null {
  const component = map.get(blockId)
  if (!component) return null

  const schema = (component as { blockSchema?: Record<string, any> }).blockSchema ?? {}
  const props = schema.props ? (unfoldSchema(schema.props) as Record<string, unknown>) : undefined
  const { $slots, ...data } = buildPreviewData(props, schema.previewData, overrides) as {
    $slots?: Record<string, PreviewSlotEntry[]>
  } & Record<string, unknown>

  const block: ContentBlock = { id, blockId, data }
  const slotNames = normalizeSlotNames(schema.slots)
  if (!slotNames.length || depth <= 0) return block

  const children: Record<string, ContentBlock[]> = {}
  for (const name of slotNames) {
    const entries = $slots?.[name]
    children[name] = entries?.length
      ? entries
          .map((entry, index) =>
            buildBlock(map, entry.blockId, entryOverrides(entry), `${id}-${name}-${index}`, depth - 1),
          )
          .filter((child): child is ContentBlock => child !== null)
      : [{ id: `${id}-${name}-placeholder`, blockId: SLOT_PLACEHOLDER_ID, data: { slotName: name } }]
  }
  block.children =
    slotNames.length === 1 && slotNames[0] === 'default' ? children['default']! : children
  return block
}

/** A child's per-instance `slots` rides into its merge as `$slots`. */
function entryOverrides(entry: PreviewSlotEntry): Record<string, unknown> | undefined {
  return entry.slots ? { ...entry.data, $slots: entry.slots } : entry.data
}

/** Slot declarations can be authored as `['start']` or compiled to `{ start: true }`. */
function normalizeSlotNames(slots: unknown): string[] {
  if (Array.isArray(slots)) return slots.filter((name): name is string => typeof name === 'string')
  if (slots && typeof slots === 'object') return Object.keys(slots)
  return []
}

export interface MountPreviewAppOptions {
  /** Block components keyed by `blockId` (the blocks virtual module). */
  blocks: BlocksMap
  /** Mount target selector or element. */
  target: string | Element
  /** Preview request; defaults to `window.__MECHANICA_PREVIEW__`. */
  request?: BlockPreviewRequest
  /** Shared data for the runtime context (`useData`), e.g. site-scope values. */
  data?: Record<string, unknown>
}

export interface MountPreviewAppResult {
  app: App | null
  error?: string
}

/**
 * Mount a single block standalone — no page, no editor — with a real runtime
 * context so composables (`useRouter`, `useData`, `Link`) work. The block's
 * data is schema defaults ← `previewData` ← request overrides, and its slots
 * are filled via {@link buildPreviewContent}. Signals completion via
 * `window.__MECHANICA_PREVIEW_READY__` once fonts and images have settled, so
 * a headless browser knows when to screenshot.
 */
export async function mountPreviewApp(options: MountPreviewAppOptions): Promise<MountPreviewAppResult> {
  const w = window as unknown as PreviewWindow
  const request = options.request ?? w.__MECHANICA_PREVIEW__ ?? {}
  const target =
    typeof options.target === 'string' ? document.querySelector(options.target) : options.target

  const fail = (message: string): MountPreviewAppResult => {
    console.error(`[mechanica preview] ${message}`)
    if (target) target.textContent = message
    w.__MECHANICA_PREVIEW_ERROR__ = message
    w.__MECHANICA_PREVIEW_READY__ = true
    return { app: null, error: message }
  }

  if (!target) return fail(`Mount target not found: ${String(options.target)}`)
  if (!request.blockId) return fail('No block id — open /@mechanica/preview/<blockId>')

  const preview = buildPreviewContent(options.blocks, request.blockId, request.data)
  if (!preview) {
    const known = [...options.blocks.keys()].sort().join(', ')
    return fail(`Unknown block "${request.blockId}". Available blocks: ${known}`)
  }

  let renderError: string | undefined
  const app = createApp({ render: () => renderBlocks([preview.content], preview.blocks) })
  app.use(
    createMechanica({
      mode: 'dev',
      blocks: preview.blocks,
      state: { content: [preview.content], data: options.data ?? {} },
    }),
  )
  app.config.errorHandler = (error) => {
    renderError = error instanceof Error ? error.message : String(error)
    console.error(error)
  }
  app.mount(target)

  await settle(target)
  if (renderError) w.__MECHANICA_PREVIEW_ERROR__ = renderError
  w.__MECHANICA_PREVIEW_READY__ = true
  return { app, error: renderError }
}

/** Wait for web fonts and every `<img>` under `root` to finish loading. */
async function settle(root: Element): Promise<void> {
  const fonts = (root.ownerDocument as { fonts?: { ready?: Promise<unknown> } }).fonts
  if (fonts?.ready) await fonts.ready.catch(() => {})
  const images = [...root.querySelectorAll('img')]
  await Promise.all(
    images.map((img) =>
      img.complete
        ? undefined
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}
