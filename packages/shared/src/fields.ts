import { registerAlias, type SchemaItem } from 'compact-json-schema'

// Mechanica uses compact-json-schema's `format` keyword for its field aliases
// (`image`, `smartLink`, …). The library keeps `SchemaAnnotations` minimal
// (`default` only), so declare `format` here — that's what lets the schemas
// below (and any block/data schema) carry `format` without an `as SchemaItem`
// cast. The output types for the alias shorthands live in mechanica's
// `core/field-types.ts` (SchemaTypesMap).
declare module 'compact-json-schema' {
  interface SchemaAnnotations {
    format?: string
  }
}

/**
 * A built-in or user-defined editable field type. The *runtime* half lives here
 * (the compact-json-schema alias + a default value); the editor component half
 * is attached separately in the plugin via `defineFieldType`.
 */
export interface FieldType {
  /** Format name, e.g. `'image'`. Used as the compact-json-schema alias. */
  name: string
  /** The compact-json-schema definition this alias expands to. */
  schema: SchemaItem
  /** Default value, or a factory returning a fresh one. */
  default?: unknown | (() => unknown)
}

/** The field types registered by default. */
export const builtinFields: FieldType[] = [
  {
    name: 'image',
    schema: { type: 'object', format: 'image', properties: { src: 'string', previewSrc: 'string?' } },
    // Start empty so the editor shows its upload/pick affordance rather than a
    // placeholder image (and pages render nothing until an image is chosen).
    default: () => ({ src: '' }),
  },
  {
    name: 'file',
    schema: { type: 'object', format: 'file', properties: { src: 'string' } },
    default: () => ({ src: '' }),
  },
  {
    name: 'text',
    schema: { type: 'string', format: 'text' },
  },
  {
    name: 'color',
    schema: { type: 'string', format: 'color' },
  },
  {
    name: 'smartLink',
    schema: {
      type: 'object',
      format: 'smartLink',
      properties: { url: 'string', title: 'string', external: 'boolean', openNewTab: 'boolean' },
    },
  },
  {
    name: 'multiselect',
    schema: { type: 'array', format: 'multiselect', items: 'string' },
  },
  {
    name: 'richText',
    schema: {
      type: 'array',
      format: 'richText',
      items: { type: 'object', properties: { text: 'string', type: 'string?', styles: 'object?' } },
    },
    default: () => [{ text: '' }],
  },
]

export type RegisterAlias = typeof registerAlias

const fieldDefaults = new Map<string, unknown | (() => unknown)>()
let registered = false

/**
 * Register field types as compact-json-schema aliases and record their default
 * values. Call once per runtime before unfolding any block/data schema.
 *
 * @param register Override the alias registrar (defaults to compact-json-schema's).
 * @param fields   Field set to register (defaults to {@link builtinFields}).
 */
export function registerFieldSchemas(
  register: RegisterAlias = registerAlias,
  fields: FieldType[] = builtinFields,
): void {
  for (const field of fields) {
    register(field.name as never, field.schema as never)
    if (field.default !== undefined) fieldDefaults.set(field.name, field.default)
  }
  registered = true
}

/** Resolve the default value for a registered field format, or `undefined`. */
export function getFieldDefault(format: string): unknown {
  const value = fieldDefaults.get(format)
  return typeof value === 'function' ? (value as () => unknown)() : value
}

/** Whether {@link registerFieldSchemas} has run in this runtime. */
export function areFieldSchemasRegistered(): boolean {
  return registered
}
