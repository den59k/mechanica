declare module 'virtual:mechanica/blocks' {
  import type { Component } from 'vue'
  export const blocksList: Component[]
  export const blocksMap: Map<string, Component>
}
