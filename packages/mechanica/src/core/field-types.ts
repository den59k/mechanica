/**
 * Type half of the built-in field registry: teaches compact-json-schema (and
 * therefore `defineBlock`) what each custom format resolves to in TypeScript.
 * The runtime half lives in `mechanica-shared` (`builtinFields`).
 */
declare module 'compact-json-schema' {
  interface SchemaTypesMap {
    text: string
    image: { src: string; previewSrc?: string; alt?: string; width?: number; height?: number }
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
