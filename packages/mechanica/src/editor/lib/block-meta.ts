import { unfoldSchema } from 'compact-json-schema'
import {
  getDefaultValue,
  type Block,
  type ComposedBlockDefinition,
  type ContentBlock,
} from 'mechanica-shared'
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
    composable: schema.composable,
    composed: schema.composed,
    props: schema.props
      ? (unfoldSchema(schema.props) as Record<string, unknown>)
      : { type: 'object', properties: {} },
    slots: schema.slots,
  }
}

/**
 * Editor-facing metadata for a composed block, in the same {@link Block} shape
 * as {@link toBlockMeta} produces for a compiled block — so the palette, the
 * settings form and schema-default filling treat both uniformly. `props` is
 * unfolded from the definition's compact schema.
 */
export function composedBlockMeta(def: ComposedBlockDefinition): Block {
  return {
    id: def.id,
    name: def.name,
    category: def.category ?? 'Site blocks',
    icon: def.icon,
    previewData: def.previewData,
    composed: true,
    props: def.props
      ? (unfoldSchema(def.props as never) as Record<string, unknown>)
      : { type: 'object', properties: {} },
  }
}

/**
 * Palette order within a category: blocks with an explicit `order` first
 * (ascending), then the rest alphabetically by name.
 */
export function compareBlocks(a: Block, b: Block): number {
  const orderA = a.order ?? Number.POSITIVE_INFINITY
  const orderB = b.order ?? Number.POSITIVE_INFINITY
  if (orderA !== orderB) return orderA - orderB
  return a.name.localeCompare(b.name)
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
