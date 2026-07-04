import { defineComponent, inject, type Component } from 'vue'
import { resolveComposedTemplate, type ComposedBlockDefinition } from 'mechanica-shared'
import { renderBlocks } from './render-blocks'
import { mechanicaKey } from './state'

/**
 * Wrap a composed-block definition as a Vue component. It reads the placed
 * instance's props (via `attrs` — the block-render pipeline passes a placed
 * block's `data` as props), resolves `$bind` bindings against them, and renders
 * the resulting template through `renderBlocks` with the ambient block set. The
 * `data-block-id` the pipeline stamps doubles as the instance id, so two
 * placements get distinct, stable vnode keys. See PLAN.md § 4.4.
 *
 * The component carries `blockId` / `blockSchema` (mirroring what a compiled
 * block's `defineOptions` sets) so the editor, preview route and default-filling
 * treat it exactly like a compiled block.
 */
export function createComposedComponent(def: ComposedBlockDefinition): Component {
  const component = defineComponent({
    name: `composed-${def.id}`,
    inheritAttrs: false,
    setup(_props, { attrs }) {
      const ctx = inject(mechanicaKey, null)
      return () => {
        const data = attrs as Record<string, unknown>
        const instanceId = String(data['data-block-id'] ?? def.id)
        const resolved = resolveComposedTemplate(def, data, instanceId)
        return renderBlocks(resolved, ctx?.blocks ?? new Map())
      }
    },
  })

  const meta = component as Record<string, unknown>
  meta.blockId = def.id
  meta.blockSchema = {
    id: def.id,
    name: def.name,
    icon: def.icon,
    category: def.category ?? 'Site blocks',
    props: def.props,
    previewData: def.previewData,
    composed: true,
  }
  return component
}
