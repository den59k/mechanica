import { createApp, type App } from 'vue'
import { unfoldSchema } from 'compact-json-schema'
import { buildPreviewData, type ContentBlock } from '@mechanica/shared'
import { createMechanica } from './create-mechanica'
import { renderBlocks } from './render-blocks'
import type { BlocksMap } from './state'

/** The payload the dev preview route injects as `window.__MECHANICA_PREVIEW__`. */
export interface BlockPreviewRequest {
  blockId?: string
  /** Prop overrides merged over the block's `previewData` and schema defaults. */
  data?: Record<string, unknown>
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
 * data is schema defaults ← `previewData` ← request overrides. Signals
 * completion via `window.__MECHANICA_PREVIEW_READY__` once fonts and images
 * have settled, so a headless browser knows when to screenshot.
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

  const component = options.blocks.get(request.blockId)
  if (!component) {
    const known = [...options.blocks.keys()].sort().join(', ')
    return fail(`Unknown block "${request.blockId}". Available blocks: ${known}`)
  }

  const schema = (component as { blockSchema?: Record<string, any> }).blockSchema ?? {}
  const props = schema.props ? (unfoldSchema(schema.props) as Record<string, unknown>) : undefined
  const data = buildPreviewData(props, schema.previewData, request.data)
  const content: ContentBlock = { id: 'preview', blockId: request.blockId, data }

  let renderError: string | undefined
  const app = createApp({ render: () => renderBlocks([content], options.blocks) })
  app.use(
    createMechanica({
      mode: 'dev',
      blocks: options.blocks,
      state: { content: [content], data: options.data ?? {} },
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
