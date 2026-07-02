import { createApp, defineComponent, onErrorCaptured, ref, shallowRef } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import { mechanicaKey, type BlocksMap, type MechanicaContext } from '../../core/state'
import { createRouter } from '../../core/router'
import { buildPreviewContent } from '../../core/preview'
import { renderBlocks } from '../../core/render-blocks'

/**
 * An inert runtime context for previews, so a block that injects the Mechanica
 * runtime (router, links, page data) still renders in isolation instead of
 * throwing. The router is built in `server` mode → no history listeners to leak.
 */
function previewContext(): MechanicaContext {
  const content = shallowRef<ContentBlock[]>([])
  const data: Record<string, unknown> = {}
  return {
    mode: 'client',
    content,
    data,
    blocks: new Map(),
    router: createRouter(content, data, { mode: 'server' }),
    queryData: {},
    page: {},
  }
}

export interface BlockPreviewHandle {
  destroy(): void
}

export interface BlockPreviewOptions {
  /** The available block components (`store.componentsById`). */
  blocks: BlocksMap
  /** Which block to preview. */
  blockId: string
  /** Prop overrides merged over the block's `previewData` and schema defaults. */
  data?: Record<string, unknown>
}

/**
 * Mount a block preview live into `target`, isolated in its own Vue app with a
 * stubbed Mechanica context. Slots are filled with the block's authored
 * `previewData.$slots` children or labelled placeholders (same content tree as
 * the `/@mechanica/preview` route — see `buildPreviewContent`). The palette
 * only ever mounts the one block being hovered and tears it down on leave, so
 * at most one preview app is alive at a time. If the block throws while
 * rendering, `onError` fires and the subtree renders nothing (the caller shows
 * a fallback) rather than breaking the preview.
 */
export function mountBlockPreview(
  target: Element,
  options: BlockPreviewOptions,
  onError?: () => void,
): BlockPreviewHandle {
  const preview = buildPreviewContent(options.blocks, options.blockId, options.data)
  if (!preview) {
    onError?.()
    return { destroy: () => {} }
  }

  const Boundary = defineComponent({
    name: 'BlockPreviewBoundary',
    setup() {
      const failed = ref(false)
      onErrorCaptured(() => {
        failed.value = true
        onError?.()
        return false // handled — don't propagate or crash the preview app
      })
      return () => (failed.value ? null : renderBlocks([preview.content], preview.blocks))
    },
  })

  const app = createApp(Boundary)
  app.provide(mechanicaKey, previewContext())
  app.mount(target)
  return { destroy: () => app.unmount() }
}
