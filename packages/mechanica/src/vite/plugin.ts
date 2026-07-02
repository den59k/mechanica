import { join } from 'node:path'
import type { Plugin } from 'vite'
import { parseVueRequest } from '@vitejs/plugin-vue'
import { passDataToHTML, serializeState } from '@mechanica/shared'
import { compileBlock } from '../compiler/compile-block'
import { collectBlocks } from './collect-blocks'
import { generateClientEntry, generatePreviewEntry, generateSsrEntry } from './entries'
import { createDevMiddleware } from './dev/middleware'
import { createPreviewMiddleware } from './dev/preview'
import { setPageCodec, setPageBlocks, pageUrlOf } from './dev/pages-store'
import { toBlockMeta } from '../editor/lib/block-meta'
import { buildPageState } from './dev/page-state'
import { wasRecentlyMutated } from './dev/fs-utils'
import { buildRichTextCodec } from './rich-text-codec'

/** Virtual module exposing the collected block components. */
export const BLOCKS_MODULE_ID = 'virtual:mechanica/blocks'
/** Virtual module that mounts the user's app (generated client entry). */
export const CLIENT_MODULE_ID = 'virtual:mechanica/client'
/** Virtual module that exposes the SSR render contract. */
export const SSR_MODULE_ID = 'virtual:mechanica/ssr'
/** Virtual module mounting a single block standalone (the dev preview route). */
export const PREVIEW_MODULE_ID = 'virtual:mechanica/preview'

const RESOLVED_BLOCKS_ID = '\0' + BLOCKS_MODULE_ID
const RESOLVED_CLIENT_ID = '\0' + CLIENT_MODULE_ID
const RESOLVED_SSR_ID = '\0' + SSR_MODULE_ID
const RESOLVED_PREVIEW_ID = '\0' + PREVIEW_MODULE_ID

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
/** Normalize a filesystem path to forward slashes (Vite ids / watcher events mix them). */
const slash = (p: string): string => p.replace(/\\/g, '/')

export function mechanica(options: MechanicaPluginOptions = {}): Plugin {
  let blocksDir = ''
  let mechDir = ''
  let userEntry = ''
  let mount = ''
  let isDev = false

  // Last compiled `blockSchema` literal per block file (normalized path), so a
  // hot update can tell schema edits (need a re-collect + reload so the editor
  // sees fresh metadata) from template/style edits (normal HMR).
  const blockSchemas = new Map<string, string>()
  const isBlockFile = (file: string): boolean =>
    file.endsWith('.vue') && slash(file).startsWith(slash(blocksDir) + '/')

  // Configure the page store's rich-text codec once, from the project's block
  // schemas (loaded via SSR so we read the compiled `blockSchema`). Memoized;
  // failures degrade to plain-string regions rather than breaking the server.
  let codecReady: Promise<void> | null = null
  const ensurePageCodec = (server: import('vite').ViteDevServer): Promise<void> => {
    if (!codecReady) {
      codecReady = server
        .ssrLoadModule(BLOCKS_MODULE_ID)
        .then((mod) => {
          setPageCodec(buildRichTextCodec(mod.blocksList ?? []))
          // The same block set feeds page-read schema migrations.
          setPageBlocks((mod.blocksList ?? []).map(toBlockMeta))
        })
        .catch((error) => {
          server.config.logger.warn(`[mechanica] rich-text codec unavailable: ${error}`)
          codecReady = null
        })
    }
    return codecReady
  }

  // Re-collect `virtual:mechanica/blocks` and reload every client. Used when a
  // block file is added/removed or its schema changes: the editor reads block
  // metadata once at startup, so a full reload is the only honest refresh.
  const invalidateBlocks = (server: import('vite').ViteDevServer): void => {
    codecReady = null
    const mod = server.moduleGraph.getModuleById(RESOLVED_BLOCKS_ID)
    if (mod) server.moduleGraph.invalidateModule(mod)
    server.ws.send({ type: 'full-reload' })
    void ensurePageCodec(server)
  }

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

      let result
      try {
        result = compileBlock(code, filename)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`[mechanica] Failed to compile block: ${message}`)
      }
      if (!result) return
      blockSchemas.set(slash(filename), result.schema)
      return { code: result.code, map: result.map }
    },

    resolveId(id) {
      if (id === BLOCKS_MODULE_ID) return RESOLVED_BLOCKS_ID
      if (id === CLIENT_MODULE_ID) return RESOLVED_CLIENT_ID
      if (id === SSR_MODULE_ID) return RESOLVED_SSR_ID
      if (id === PREVIEW_MODULE_ID) return RESOLVED_PREVIEW_ID
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
      if (id === RESOLVED_PREVIEW_ID) {
        return generatePreviewEntry({ userEntry })
      }
    },

    configureServer(server) {
      // Registered before the general middleware so `/preview/…` never falls
      // through to the page-CRUD handler.
      server.middlewares.use('/@mechanica/preview', createPreviewMiddleware())
      server.middlewares.use(
        '/@mechanica',
        createDevMiddleware(mechDir, { ready: () => ensurePageCodec(server) }),
      )
      // Start loading block schemas now so saves convert richText correctly even
      // before the first page render awaits the codec.
      void ensurePageCodec(server)

      // Adding or removing a block file re-collects the blocks module and
      // reloads, so new blocks appear in the palette without a server restart.
      server.watcher.on('add', (file) => {
        if (isBlockFile(file)) invalidateBlocks(server)
      })
      server.watcher.on('unlink', (file) => {
        if (!isBlockFile(file)) return
        blockSchemas.delete(slash(file))
        invalidateBlocks(server)
      })

      // External edits to the `.mech` store (Claude editing a .page.md, manual
      // file edits) are pushed to open editors so they refresh live. Our own
      // writes are registered in fs-utils and skipped — otherwise every save
      // would echo back as an "external" change.
      const onMechFile = (file: string): void => {
        if (wasRecentlyMutated(file)) return
        const f = slash(file)
        const pagePath = pageUrlOf(mechDir, file)
        if (pagePath) {
          server.ws.send({ type: 'custom', event: 'mechanica:store-changed', data: { path: pagePath } })
        } else if (f === slash(mechDir) + '/data.json' || f === slash(mechDir) + '/folders.json') {
          // Shared data affects every page; no path means "refresh regardless".
          server.ws.send({ type: 'custom', event: 'mechanica:store-changed', data: {} })
        }
      }
      server.watcher.on('add', onMechFile)
      server.watcher.on('change', onMechFile)
      server.watcher.on('unlink', onMechFile)
    },

    // Schema edits need a re-collect + full reload (the editor reads block
    // metadata once at startup); template/style edits keep normal HMR.
    async handleHotUpdate(ctx) {
      if (!isBlockFile(ctx.file)) return
      const key = slash(ctx.file)
      const previous = blockSchemas.get(key)
      let schema: string | null
      try {
        const code = await ctx.read()
        schema = code.includes('defineBlock') ? compileBlock(code, ctx.file)?.schema ?? null : null
      } catch {
        // Mid-edit syntax error — let the normal pipeline surface it.
        return
      }
      // Never-seen file (not transformed yet this session): record, default HMR.
      if (previous === undefined) {
        if (schema != null) blockSchemas.set(key, schema)
        return
      }
      if (schema === previous) return
      if (schema == null) blockSchemas.delete(key)
      else blockSchemas.set(key, schema)
      invalidateBlocks(ctx.server)
    },

    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        // Production build: bundle the client entry so the built HTML hydrates.
        if (!isDev) {
          const clientScript = `<script type="module">import ${JSON.stringify(CLIENT_MODULE_ID)}</script>`
          return html.replace('</body>', `${clientScript}\n</body>`)
        }

        const url = new URL(ctx.originalUrl ?? '/', 'http://localhost')
        const urlPath = url.pathname
        // Skip asset requests; only inject for page navigations.
        if (/\.\w+$/.test(urlPath)) return html
        // `mechanica shot` renders pages without the editor overlay so
        // screenshots show the page as a visitor sees it.
        const withEditor = !url.searchParams.has('mechanica-shot')

        // Ensure richText fields hydrate as Block[] (not raw Markdown).
        if (ctx.server) await ensurePageCodec(ctx.server)
        // Site < folder < page resolution plus the editor's scope buckets and
        // the page's on-disk version (for optimistic-concurrency saves).
        const state = buildPageState(mechDir, urlPath)
        const inject = [
          `<script>window.state=${serializeState(state)}</script>`,
          `<script type="module">`,
          `import ${JSON.stringify(CLIENT_MODULE_ID)}`,
          ...(withEditor ? [`import 'mechanica/editor'`] : []),
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
