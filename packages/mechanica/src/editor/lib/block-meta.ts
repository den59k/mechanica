import { unfoldSchema } from 'compact-json-schema'
import { getDefaultValue, type Block, type ContentBlock } from '@mechanica/shared'
import { humanize } from '../props-panel/humanize'
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
    folders: schema.folders,
    version: schema.version,
    migrate: schema.migrate,
    previewData: schema.previewData,
    props: schema.props
      ? (unfoldSchema(schema.props) as Record<string, unknown>)
      : { type: 'object', properties: {} },
    slots: schema.slots,
  }
}

/** Create a fresh placed block with schema defaults for its data. */
export function createContentBlock(block: Block): ContentBlock {
  const data = block.props ? (getDefaultValue(block.props) as Record<string, unknown>) : {}
  const content: ContentBlock = { id: uid(), blockId: block.id, data: data ?? {} }
  // Versioned blocks record the schema version their data was written with.
  if (block.version) content.v = block.version
  return content
}

/**
 * Whether the palette offers a block on a page in `folder` (null = root).
 * A block without `folders` is offered everywhere; with `folders` it is
 * offered only under those folders (nested folders match by prefix, so
 * `'docs'` covers `docs/guides` too). Already-placed blocks always render —
 * this only filters the palette.
 */
export function blockAvailableIn(block: Block, folder: string | null): boolean {
  if (!block.folders || block.folders.length === 0) return true
  if (folder == null) return false
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '')
  return block.folders.some((entry) => {
    const scope = entry.replace(/^\/+|\/+$/g, '')
    return normalizedFolder === scope || normalizedFolder.startsWith(scope + '/')
  })
}
