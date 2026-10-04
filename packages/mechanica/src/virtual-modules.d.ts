declare module 'virtual:mechanica/blocks' {
  import type { Component } from 'vue'
  export const blocksList: Component[]
  export const blocksMap: Map<string, Component>
}

declare module 'virtual:mechanica/widgets' {
  import type { RichTextWidget } from './editor/fields/richtext/widgets'
  export const widgetsList: RichTextWidget[]
}

declare module 'virtual:mechanica/composed' {
  import type { ComposedBlockDefinition } from 'mechanica-shared'
  export const composedList: ComposedBlockDefinition[]
}

// Minimal slice of Vite's HMR client API (avoids depending on vite/client
// types, which would also claim .css/.svg module shapes we declare ourselves).
interface ImportMeta {
  readonly hot?: {
    on(event: string, callback: (data: any) => void): void
    off(event: string, callback: (data: any) => void): void
  }
}
