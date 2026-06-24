declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, any>, Record<string, any>, any>
  export default component
}

declare module '*.css' {}
declare module '*.scss' {}

// Virtual module produced by the svg-glob plugin (e.g. `import … from '../icons?svg-glob'`).
declare module '*?svg-glob' {
  export const contents: Record<string, string>
  export const attrs: Record<string, Record<string, string>>
}
