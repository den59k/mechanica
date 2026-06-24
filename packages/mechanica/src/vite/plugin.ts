import { join } from 'node:path'
import type { Plugin } from 'vite'
import { parseVueRequest } from '@vitejs/plugin-vue'
import { passDataToHTML } from '@mechanica/shared'
import { compileBlock } from '../compiler/compile-block'
import { collectBlocks } from './collect-blocks'
import { generateClientEntry, generateSsrEntry } from './entries'
import { createDevMiddleware } from './dev/middleware'
import { readPage } from './dev/pages-store'
import { readSiteData, readFolderData, folderOf } from './dev/data-store'

/** Virtual module exposing the collected block components. */
export const BLOCKS_MODULE_ID = 'virtual:mechanica/blocks'
/** Virtual module that mounts the user's app (generated client entry). */
export const CLIENT_MODULE_ID = 'virtual:mechanica/client'
/** Virtual module that exposes the SSR render contract. */
export const SSR_MODULE_ID = 'virtual:mechanica/ssr'

const RESOLVED_BLOCKS_ID = '\0' + BLOCKS_MODULE_ID
const RESOLVED_CLIENT_ID = '\0' + CLIENT_MODULE_ID
const RESOLVED_SSR_ID = '\0' + SSR_MODULE_ID

export interface MechanicaPluginOptions {
  /** The user's `defineMechanicaApp` entry module, relative to the Vite root. */
  entry?: string
  /** CSS selector the app mounts into. */
  mount?: string
  /** Directory scanned for block SFCs, relative to the Vite root. */
  blocksDir?: string
  /** Directory holding local editor state, relative to the Vite root. */
  mechDir?: string
}

/**
 * The Mechanica Vite plugin: rewrites the `defineBlock` macro, serves the
 * `virtual:mechanica/blocks` and `virtual:mechanica/client` modules, mounts the
 * `/@mechanica` dev middleware, and injects page state + entries into dev HTML.
 */
export function mechanica(options: MechanicaPluginOptions = {}): Plugin {
  let blocksDir = ''
  let mechDir = ''
  let userEntry = ''
  let mount = ''
  let isDev = false

  return {
    name: 'mechanica',
    enforce: 'pre',

    configResolved(config) {
      blocksDir = join(config.root, options.blocksDir ?? 'src/blocks')
      mechDir = join(config.root, options.mechDir ?? '.mech')
      userEntry = '/' + (options.entry ?? 'src/main.ts').replace(/^\/+/, '')
      mount = options.mount ?? '#app'
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
      if (id === CLIENT_MODULE_ID) return RESOLVED_CLIENT_ID
      if (id === SSR_MODULE_ID) return RESOLVED_SSR_ID
    },

    load(id) {
      if (id === RESOLVED_BLOCKS_ID) {
        return collectBlocks(blocksDir, (p) => this.resolve(p))
      }
      if (id === RESOLVED_CLIENT_ID) {
        return generateClientEntry({ userEntry, mount, mode: isDev ? 'dev' : 'client' })
      }
      if (id === RESOLVED_SSR_ID) {
        return generateSsrEntry({ userEntry })
      }
    },

    configureServer(server) {
      server.middlewares.use('/@mechanica', createDevMiddleware(mechDir))
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Production build: bundle the client entry so the built HTML hydrates.
        if (!isDev) {
          const clientScript = `<script type="module">import ${JSON.stringify(CLIENT_MODULE_ID)}</script>`
          return html.replace('</body>', `${clientScript}\n</body>`)
        }

        const urlPath = (ctx.originalUrl ?? '/').split('?')[0]!
        // Skip asset requests; only inject for page navigations.
        if (/\.\w+$/.test(urlPath)) return html

        const page = readPage(mechDir, urlPath)
        // Folder- and site-scoped data are shared, so merge them over the page's own.
        const state = {
          content: page.content ?? [],
          data: { ...page.data, ...readFolderData(mechDir, folderOf(mechDir, urlPath)), ...readSiteData(mechDir) },
          page: { path: urlPath, meta: page.meta ?? {} },
        }
        const inject = [
          `<script>window.state=${JSON.stringify(state)}</script>`,
          `<script type="module">`,
          `import ${JSON.stringify(CLIENT_MODULE_ID)}`,
          `import 'mechanica/editor'`,
          `</script>`,
        ].join('\n')
        // Resolve `{{ … }}` head placeholders the same way the build does, so the
        // dev preview shows real <title>/<meta> values. Template before injecting
        // the state script (whose JSON must not be touched).
        const templated = passDataToHTML(html, { ...state.data, page: state.page })
        return templated.replace('<body>', `<body>\n${inject}`)
      },
    },
  }
}
