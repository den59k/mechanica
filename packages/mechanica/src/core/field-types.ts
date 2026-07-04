/**
 * Type half of the built-in field registry: teaches compact-json-schema (and
 * therefore `defineBlock`) what each custom format resolves to in TypeScript.
 * The runtime half lives in `mechanica-shared` (`builtinFields`).
 */
declare module 'compact-json-schema' {
  interface SchemaTypesMap {
    text: string
    image: {
      src: string
      previewSrc?: string
      alt?: string
      width?: number
      height?: number
      /** Focal point (0..1) — drives `object-position` / `background-position`. */
      focalX?: number
      focalY?: number
      /** Normalized crop rectangle over the original (0..1). */
      crop?: { x: number; y: number; width: number; height: number }
      /** The baked cropped + downscaled derivative rendered in place of `src`. */
      croppedSrc?: string
      croppedWidth?: number
      croppedHeight?: number
    }
    file: { src: string }
    color: string
    smartLink: { url: string; title: string; external: boolean }
    multiselect: string[]
    richText: Array<{
      text: string
      type?: string
      styles?: Array<{ start: number; end: number; style: string }>
    }>
  }
}

export {}
