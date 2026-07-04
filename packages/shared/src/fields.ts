import { registerAlias, type SchemaItem } from 'compact-json-schema'

/**
 * Per-field cropping config for the `image` field, declared as an annotation on
 * a block/data schema — e.g. `{ type: 'image', crop: { width: 1200, height: 630 } }`.
 * `true` enables a free crop frame; `{ width, height }` locks the frame's aspect
 * to `width/height` and downscales the derivative to that box; `{ aspect }` locks
 * the ratio without a size cap. The editor's crop dialog reads this off the
 * unfolded schema; the runtime ignores it. See `ImageValue` for what a crop
 * produces on the value (`crop` rect + `croppedSrc`).
 */
export type ImageCropConfig =
  | boolean
  | {
      /** Target output width in px (locks the crop aspect to width/height). */
      width?: number
      /** Target output height in px. */
      height?: number
      /** Lock the crop ratio without a size cap; ignored when width & height are set. */
      aspect?: number
    }

// Mechanica uses compact-json-schema's `format` keyword for its field aliases
// (`image`, `smartLink`, …). The library keeps `SchemaAnnotations` minimal
// (`default` only), so declare `format` here — that's what lets the schemas
// below (and any block/data schema) carry `format` without an `as SchemaItem`
// cast. `crop` rides the same channel: an extra keyword on an `image` field that
// survives unfolding onto the field editor's `schema` prop. The output types for
// the alias shorthands live in mechanica's `core/field-types.ts` (SchemaTypesMap).
declare module 'compact-json-schema' {
  interface SchemaAnnotations {
    format?: string
    crop?: ImageCropConfig
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
    // `alt` is authored in the editor (image SEO + accessibility); `width` /
    // `height` are the intrinsic pixel size of the *original*, captured when the
    // image is chosen, so blocks can render dimension attributes and avoid
    // layout shift. `focalX`/`focalY` are a 0..1 focal point (drives
    // `object-position` / `background-position`); `crop` is a normalized crop
    // rectangle over the original whose baked-down result is `croppedSrc`
    // (`croppedWidth`/`croppedHeight` its intrinsic size). Non-destructive: the
    // original `src` + `crop` stay on the value, so a crop is always re-editable.
    schema: {
      type: 'object',
      format: 'image',
      properties: {
        src: 'string',
        previewSrc: 'string?',
        alt: 'string?',
        width: 'number?',
        height: 'number?',
        focalX: 'number?',
        focalY: 'number?',
        crop: {
          type: 'object?',
          properties: { x: 'number', y: 'number', width: 'number', height: 'number' },
        },
        croppedSrc: 'string?',
        croppedWidth: 'number?',
        croppedHeight: 'number?',
      },
    },
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
