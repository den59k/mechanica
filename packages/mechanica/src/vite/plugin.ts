import { join } from 'node:path'
import type { Plugin } from 'vite'
import { parseVueRequest } from '@vitejs/plugin-vue'
import { compileBlock } from '../compiler/compile-block'
import { collectBlocks } from './collect-blocks'
import { createDevMiddleware } from './dev/middleware'
import { readPage } from './dev/pages-store'

/** Virtual module exposing the collected block components. */
export const BLOCKS_MODULE_ID = 'virtual:mechanica/blocks'
const RESOLVED_BLOCKS_ID = '\0' + BLOCKS_MODULE_ID

export interface MechanicaPluginOptions {
  /** Directory scanned for block SFCs, relative to the Vite root. */
  blocksDir?: string
  /** Directory holding local editor state, relative to the Vite root. */
  mechDir?: string
}

/**
 * The Mechanica Vite plugin. Runs before `@vitejs/plugin-vue` to rewrite the
 * `defineBlock` macro, serves the `virtual:mechanica/blocks` module, mounts the
 * `/@mechanica` dev middleware, and injects page state into the dev HTML.
 */
export function mechanica(options: MechanicaPluginOptions = {}): Plugin {
  let root = ''
  let blocksDir = ''
  let mechDir = ''
  let isDev = false

  return {
    name: 'mechanica',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
      blocksDir = join(root, options.blocksDir ?? 'src/blocks')
      mechDir = join(root, options.mechDir ?? '.mech')
      isDev = config.command === 'serve'
    },

    transform(code, id) {
      const { filename, query } = parseVueRequest(id)
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

    configureServer(server) {
      server.middlewares.use('/@mechanica', createDevMiddleware(mechDir))
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!isDev) return html
        const urlPath = (ctx.originalUrl ?? '/').split('?')[0]!
        // Skip asset requests; only inject for page navigations.
        if (/\.\w+$/.test(urlPath)) return html

        const page = readPage(mechDir, urlPath)
        const state = {
          content: page.content ?? [],
          data: page.data ?? {},
          page: { path: urlPath, meta: page.meta ?? {} },
        }
        const inject = `<script>window.state=${JSON.stringify(state)}</script>`
        return html.replace('<body>', `<body>\n${inject}`)
      },
    },
  }
}
