import { join } from 'node:path'
import type { Plugin } from 'vite'
import { parseVueRequest } from '@vitejs/plugin-vue'
import { compileBlock } from '../compiler/compile-block'
import { collectBlocks } from './collect-blocks'

/** Virtual module exposing the collected block components. */
export const BLOCKS_MODULE_ID = 'virtual:mechanica/blocks'
const RESOLVED_BLOCKS_ID = '\0' + BLOCKS_MODULE_ID

export interface MechanicaPluginOptions {
  /** Directory scanned for block SFCs, relative to the Vite root. */
  blocksDir?: string
}

/**
 * The Mechanica Vite plugin. Runs before `@vitejs/plugin-vue` to rewrite the
 * `defineBlock` macro in block SFCs, and serves the `virtual:mechanica/blocks`
 * module that gathers every block for the runtime.
 */
export function mechanica(options: MechanicaPluginOptions = {}): Plugin {
  let blocksDir = ''

  return {
    name: 'mechanica',
    enforce: 'pre',

    configResolved(config) {
      blocksDir = join(config.root, options.blocksDir ?? 'src/blocks')
    },

    transform(code, id) {
      const { filename, query } = parseVueRequest(id)
      // Only the main SFC request — leave plugin-vue's sub-requests alone.
      if (query.vue || !filename.endsWith('.vue')) return
      if (!code.includes('defineBlock')) return

      const result = compileBlock(code, filename)
      if (!result) return
      return { code: result.code, map: result.map }
    },

    resolveId(id) {
      if (id === BLOCKS_MODULE_ID) return RESOLVED_BLOCKS_ID
    },

    load(id) {
      if (id === RESOLVED_BLOCKS_ID) {
        return collectBlocks(blocksDir, (p) => this.resolve(p))
      }
    },
  }
}
