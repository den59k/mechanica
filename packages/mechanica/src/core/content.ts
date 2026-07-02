import { defineComponent, inject } from 'vue'
import { renderBlocks } from './render-blocks'
import { mechanicaKey } from './state'

/**
 * Renders the current page's block tree. Place once in your root layout where
 * page content should appear.
 */
export const Content = defineComponent({
  name: 'MechContent',
  setup() {
    const ctx = inject(mechanicaKey)
    if (!ctx) {
      throw new Error('[mechanica] <Content> was used without createMechanica() installed')
    }
    return () => {
      // Paginated variants of a page share its content tree (same node ids), so
      // the keys carry the page number — moving /blog → /blog/2 remounts the
      // blocks, and their mount-time queries re-run for the new slice.
      const page = ctx.page.pagination?.page ?? 1
      return renderBlocks(ctx.content.value, ctx.blocks, page > 1 ? `p${page}-` : undefined)
    }
  },
})
