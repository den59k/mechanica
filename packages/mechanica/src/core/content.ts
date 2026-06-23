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
    return () => renderBlocks(ctx.content.value, ctx.blocks)
  },
})
