import { createApp, defineComponent, h, onErrorCaptured, ref, shallowRef, type Component } from 'vue'
import type { ContentBlock } from '@mechanica/shared'
import { mechanicaKey, type MechanicaContext } from '../../core/state'
import { createRouter } from '../../core/router'

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

/**
 * Mount a block component live into `target`, isolated in its own Vue app with a
 * stubbed Mechanica context. The palette only ever mounts the one block being
 * hovered and tears it down on leave, so at most one preview app is alive at a
 * time — none of the "100 live components" cost. If the block throws while
 * rendering, `onError` fires and the subtree renders nothing (the caller shows a
 * fallback) rather than breaking the preview.
 */
export function mountBlockPreview(
  target: Element,
  component: Component,
  data: Record<string, unknown>,
  onError?: () => void,
): BlockPreviewHandle {
  const Boundary = defineComponent({
    name: 'BlockPreviewBoundary',
    setup() {
      const failed = ref(false)
      onErrorCaptured(() => {
        failed.value = true
        onError?.()
        return false // handled — don't propagate or crash the preview app
      })
      return () => (failed.value ? null : h(component, data))
    },
  })

  const app = createApp(Boundary)
  app.provide(mechanicaKey, previewContext())
  app.mount(target)
  return { destroy: () => app.unmount() }
}
