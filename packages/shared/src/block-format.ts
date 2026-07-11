import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ComposedBlockDefinition, ContentBlock } from './types'

/**
 * Codec for the composed-block file format (`.mech/blocks/<id>.block.yml`) — a
 * single YAML document holding a {@link ComposedBlockDefinition}. Kept a
 * separate entry point (`mechanica-shared/block-format`), deliberately NOT
 * re-exported from the barrel: it pulls in the YAML parser, and the barrel is
 * imported by the client runtime, which never parses these files (only the dev
 * store, the plugin's collect step, and the CLI do). Mirrors the `page-format`
 * rule. See PLAN.md § 3.
 */

/** Thrown by {@link parseComposedBlock} with a human-readable reason. */
export class ComposedBlockParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComposedBlockParseError'
    Object.setPrototypeOf(this, ComposedBlockParseError.prototype)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate the minimal shape of a content node (recurses into children). */
function assertContentBlock(node: unknown, where: string): asserts node is ContentBlock {
  if (!isPlainObject(node)) throw new ComposedBlockParseError(`${where}: expected a mapping`)
  if (typeof node.blockId !== 'string' || node.blockId === '') {
    throw new ComposedBlockParseError(`${where}: missing "blockId"`)
  }
  if (node.data !== undefined && !isPlainObject(node.data)) {
    throw new ComposedBlockParseError(`${where}: "data" must be a mapping`)
  }
  const children = node.children
  if (children === undefined) return
  if (Array.isArray(children)) {
    children.forEach((child, i) => assertContentBlock(child, `${where} › child ${i}`))
  } else if (isPlainObject(children)) {
    for (const [slot, list] of Object.entries(children)) {
      if (!Array.isArray(list)) throw new ComposedBlockParseError(`${where}: slot "${slot}" must be a list`)
      list.forEach((child, i) => assertContentBlock(child, `${where} › ${slot}[${i}]`))
    }
  } else {
    throw new ComposedBlockParseError(`${where}: "children" must be a list or a slot mapping`)
  }
}

/**
 * Parse a `.block.yml` document into a {@link ComposedBlockDefinition}.
 *
 * @param fallbackId Used as the id when the document omits one — the store and
 *                   plugin pass the filename base, so a hand-authored file may
 *                   omit `id` and be identified by its filename.
 */
export function parseComposedBlock(text: string, fallbackId?: string): ComposedBlockDefinition {
  let doc: unknown
  try {
    doc = parseYaml(text)
  } catch (error) {
    throw new ComposedBlockParseError(`invalid YAML: ${error instanceof Error ? error.message : error}`)
  }
  if (doc == null) doc = {}
  if (!isPlainObject(doc)) throw new ComposedBlockParseError('expected a top-level mapping')

  const id = typeof doc.id === 'string' && doc.id !== '' ? doc.id : fallbackId
  if (!id) throw new ComposedBlockParseError('missing "id"')
  if (typeof doc.name !== 'string' || doc.name === '') throw new ComposedBlockParseError('missing "name"')

  const template = doc.template ?? []
  if (!Array.isArray(template)) throw new ComposedBlockParseError('"template" must be a list')
  template.forEach((node, i) => assertContentBlock(node, `template[${i}]`))

  if (doc.props !== undefined && !isPlainObject(doc.props)) {
    throw new ComposedBlockParseError('"props" must be a mapping')
  }
  if (doc.previewData !== undefined && !isPlainObject(doc.previewData)) {
    throw new ComposedBlockParseError('"previewData" must be a mapping')
  }

  const def: ComposedBlockDefinition = { id, name: doc.name, template: template as ContentBlock[] }
  if (typeof doc.icon === 'string') def.icon = doc.icon
  if (typeof doc.category === 'string') def.category = doc.category
  if (doc.hidden === true) def.hidden = true
  if (isPlainObject(doc.props)) def.props = doc.props
  if (isPlainObject(doc.previewData)) def.previewData = doc.previewData
  return def
}

/** Serialize a {@link ComposedBlockDefinition} to a `.block.yml` document. */
export function serializeComposedBlock(def: ComposedBlockDefinition): string {
  // Build an ordered object so the file reads header-first, tree-last.
  const ordered: Record<string, unknown> = { id: def.id, name: def.name }
  if (def.icon) ordered.icon = def.icon
  if (def.category) ordered.category = def.category
  // Only emit `hidden` when true — reusable blocks stay clean (like `draft`).
  if (def.hidden) ordered.hidden = true
  if (def.props && Object.keys(def.props).length) ordered.props = def.props
  if (def.previewData && Object.keys(def.previewData).length) ordered.previewData = def.previewData
  ordered.template = def.template ?? []
  return stringifyYaml(ordered, { lineWidth: 0 })
}
