import type { Component } from 'vue'
import { registerFieldSchemas, type FieldType as FieldSchema } from '@mechanica/shared'

const editors = new Map<string, Component>()

/** Map a field name (format or type) to its editor component. */
export function registerFieldEditor(name: string, component: Component): void {
  editors.set(name, component)
}

/** A full field-type definition: schema alias + default + editor component. */
export interface FieldTypeDefinition extends FieldSchema {
  editor: Component
}

/**
 * Declare a custom field type. Combines the runtime schema/default (shared) with
 * the editor component (here) in a single object — the §3.2 unified registry.
 */
export function defineFieldType(definition: FieldTypeDefinition): FieldTypeDefinition {
  return definition
}

/** Register custom field types: their schema aliases and editor components. */
export function registerFields(definitions: FieldTypeDefinition[]): void {
  registerFieldSchemas(undefined, definitions)
  for (const def of definitions) registerFieldEditor(def.name, def.editor)
}

interface SchemaNode {
  type?: string
  format?: string
  enum?: unknown[]
}

/** Resolve the editor component for an unfolded schema node: format → enum → type → string. */
export function resolveFieldEditor(schema: SchemaNode): Component | undefined {
  if (schema.format && editors.has(schema.format)) return editors.get(schema.format)
  if (schema.enum && editors.has('enum')) return editors.get('enum')
  if (schema.type && editors.has(schema.type)) return editors.get(schema.type)
  return editors.get('string')
}

/** Look up a single editor by name. */
export function getFieldEditor(name: string): Component | undefined {
  return editors.get(name)
}

/** Clear all registered editors (tests). */
export function clearFieldEditors(): void {
  editors.clear()
}
