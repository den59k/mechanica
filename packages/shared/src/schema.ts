import type { Block, ContentBlock } from './types'
import { getFieldDefault } from './fields'

/**
 * Compute the default value for a (compact-unfolded) schema node, consulting the
 * field registry for format-specific defaults (e.g. `image`, `richText`).
 */
export function getDefaultValue(schema: any): any {
  if (schema.default !== undefined) return schema.default
  if (schema.nullable) return null

  if (schema.format) {
    const fieldDefault = getFieldDefault(schema.format)
    if (fieldDefault !== undefined) return fieldDefault
  }

  if (schema.type === 'number' || schema.type === 'integer') return 0
  if (schema.type === 'object') {
    if (!schema.properties) return {}
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => {
        if (!schema.required?.includes(key)) return [key, undefined]
        return [key, getDefaultValue(value)]
      }),
    )
  }
  if (schema.type === 'array') return []
  if (schema.type === 'boolean') return false
  return ''
}

/**
 * Fill missing values in `state` with schema defaults, recursing into objects.
 * Returns `state` when present, otherwise a freshly generated default.
 */
export function passDefaultValue(state: any, schema: any): any {
  if (!schema) return state
  if (schema.type === 'object' && state) {
    for (const key in schema.properties) {
      if (!(key in state) && !schema.required?.includes(key)) continue
      state[key] = passDefaultValue(state[key], schema.properties[key])
    }
  }
  return state ?? getDefaultValue(schema)
}

/** Depth-first walk over a content tree, including array and named-slot children. */
export function walkTree(blocks: ContentBlock[], callback: (block: ContentBlock) => void): void {
  for (const block of blocks) {
    callback(block)
    if (!block.children) continue
    if (Array.isArray(block.children)) {
      walkTree(block.children, callback)
    } else {
      for (const list of Object.values(block.children)) {
        walkTree(list, callback)
      }
    }
  }
}

type WalkSchemaCallback = (
  value: any,
  schema: any,
  key?: string,
  parent?: any,
  isRequired?: boolean,
) => void

/** Walk a value alongside its schema, invoking `callback` for each described node. */
export function walkSchema(obj: any, schema: Block['props'] | any, callback: WalkSchemaCallback): void {
  if (schema.type === 'object' && schema.properties && obj) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      const isRequired = schema.required?.includes(key) ?? false
      callback(obj[key], childSchema, key, obj, isRequired)

      const childType = (childSchema as any).type
      if (childType === 'array' || childType === 'object') {
        walkSchema(obj[key], childSchema, callback)
      }
    }
  }

  if (schema.type === 'array' && schema.items && obj) {
    for (const value of obj) {
      callback(value, schema.items)
      if (schema.items.type === 'array' || schema.items.type === 'object') {
        walkSchema(value, schema.items, callback)
      }
    }
  }
}
