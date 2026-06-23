import { registerAlias, type SchemaItem } from 'compact-json-schema'

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

const placeholderImage =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjJGMkYyIiByeD0iOCIvPjxwYXRoIGZpbGw9IiM2RDZENkQiIGQ9Ik00MS42IDE5LjZIMjIuNEE0LjQgNC40IDAgMCAwIDE4IDI0djE2YTQuNCA0LjQgMCAwIDAgNC40IDQuNGgxOS4yQTQuNCA0LjQgMCAwIDAgNDYgNDBWMjRhNC40IDQuNCAwIDAgMC00LjQtNC40TTIyLjQgMjJoMTkuMmEyIDIgMCAwIDEgMiAydjEzLjEwNGwtNC4zNTItNC4zNTJhMS4xMiAxLjEyIDAgMCAwLS44OTYtLjM1MiAxLjI4IDEuMjggMCAwIDAtLjg4LjQzMmwtMi4wNjQgMi40OC03LjM2LTcuMzZhMS4xMiAxLjEyIDAgMCAwLS44NDgtLjM1MiAxLjI4IDEuMjggMCAwIDAtLjg4LjQzMmwtNS45MiA3LjA1NlYyNGEyIDIgMCAwIDEgMi0ybS0yIDE4di0xLjE2OGw2Ljg4LTguMjU2IDYuNTkyIDYuNTkyLTQuMDMyIDQuOEgyMi40YTIgMiAwIDAgMS0yLTEuOTY4bTIxLjIgMmgtOC42NGw1LjUyLTYuNjI0IDUuMDQgNS4wNEExLjk3IDEuOTcgMCAwIDEgNDEuNiA0MiIvPjwvc3ZnPg=='

/** The field types registered by default. */
export const builtinFields: FieldType[] = [
  {
    name: 'image',
    schema: { type: 'object', format: 'image', properties: { src: 'string', previewSrc: 'string?' } } as SchemaItem,
    default: () => ({ src: placeholderImage, previewSrc: placeholderImage }),
  },
  {
    name: 'file',
    schema: { type: 'object', format: 'file', properties: { src: 'string' } } as SchemaItem,
    default: () => ({ src: '' }),
  },
  {
    name: 'text',
    schema: { type: 'string', format: 'text' } as SchemaItem,
  },
  {
    name: 'color',
    schema: { type: 'string', format: 'color' } as SchemaItem,
  },
  {
    name: 'smartLink',
    schema: {
      type: 'object',
      format: 'smartLink',
      properties: { url: 'string', title: 'string', external: 'boolean' },
    } as SchemaItem,
  },
  {
    name: 'multiselect',
    schema: { type: 'array', format: 'multiselect', items: 'string' } as SchemaItem,
  },
  {
    name: 'richText',
    schema: {
      type: 'array',
      format: 'richText',
      items: { type: 'object', properties: { text: 'string', type: 'string?', styles: 'object?' } },
    } as SchemaItem,
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
