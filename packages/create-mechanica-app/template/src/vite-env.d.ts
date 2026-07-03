/// <reference types="vite/client" />

// Module shims so plain `tsc` (typechecking runs with tsc, not vue-tsc, so it
// doesn't parse .vue/.scss) can resolve SFC and style imports. The `defineBlock`
// macro is typed globally by `mechanica` itself, pulled in via the app's imports.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, any>, Record<string, any>, any>
  export default component
}
declare module '*.css' {}
declare module '*.scss' {}
