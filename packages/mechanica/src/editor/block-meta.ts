import { unfoldSchema } from 'compact-json-schema'
import { getDefaultValue, type Block, type ContentBlock } from '@mechanica/shared'
import { humanize } from './props-panel/humanize'
import { uid } from './content-tree'

/** A compiled block component as exposed by the blocks virtual module. */
export interface BlockComponent {
  blockId?: string
  __name?: string
  blockSchema?: Record<string, any>
}

/** Derive editor-facing block metadata from a compiled block component. */
export function toBlockMeta(component: BlockComponent): Block {
  const schema = component.blockSchema ?? {}
  const id = component.blockId ?? component.__name ?? 'block'
  return {
    id,
    name: schema.name ?? humanize(component.__name ?? id),
    category: schema.category,
    icon: schema.icon,
    description: schema.description,
    order: schema.order,
    hidden: schema.hidden,
    devOnly: schema.devOnly,
    props: schema.props
      ? (unfoldSchema(schema.props) as Record<string, unknown>)
      : { type: 'object', properties: {} },
    slots: schema.slots,
  }
}

/** Create a fresh placed block with schema defaults for its data. */
export function createContentBlock(block: Block): ContentBlock {
  const data = block.props ? (getDefaultValue(block.props) as Record<string, unknown>) : {}
  return { id: uid(), blockId: block.id, data: data ?? {} }
}
