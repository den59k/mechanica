import { join, relative } from 'node:path'
import type { Plugin } from 'vite'
import { parseVueRequest } from '@vitejs/plugin-vue'
import { passDataToHTML, serializeState } from '@mechanica/shared'
import { compileBlock } from '../compiler/compile-block'
import { collectBlocks, collectBlocksLazy } from './collect-blocks'
import { collectWidgets } from './collect-widgets'
import { generateClientEntry, generatePreviewEntry, generateSsrEntry } from './entries'
import { createDevMiddleware } from './dev/middleware'
import { createPreviewMiddleware } from './dev/preview'
import { setPageCodec, setPageBlocks, pageUrlOf } from './dev/pages-store'
import { toBlockMeta } from '../editor/lib/block-meta'
import { buildPageState } from './dev/page-state'
import { wasRecentlyMutated } from './dev/fs-utils'
import { buildRichTextCodec } from './rich-text-codec'
import { BLOCKS_MANIFEST_FILE } from '../cli/page-assets'

/** Virtual module exposing the collected block components. */
export const BLOCKS_MODULE_ID = 'virtual:mechanica/blocks'
/** Virtual module that mounts the user's app (generated client entry). */
export const CLIENT_MODULE_ID = 'virtual:mechanica/client'
/** Virtual module that exposes the SSR render contract. */
export const SSR_MODULE_ID = 'virtual:mechanica/ssr'
/** Virtual module mounting a single block standalone (the dev preview route). */
export const PREVIEW_MODULE_ID = 'virtual:mechanica/preview'
/** Virtual module exposing the site's rich-text widgets (editor-only). */
export const WIDGETS_MODULE_ID = 'virtual:mechanica/widgets'

const RESOLVED_BLOCKS_ID = '\0' + BLOCKS_MODULE_ID
const RESOLVED_CLIENT_ID = '\0' + CLIENT_MODULE_ID
const RESOLVED_SSR_ID = '\0' + SSR_MODULE_ID
const RESOLVED_PREVIEW_ID = '\0' + PREVIEW_MODULE_ID
const RESOLVED_WIDGETS_ID = '\0' + WIDGETS_MODULE_ID

export interface MechanicaPluginOptions {
  /** The user's `defineMechanicaApp` entry module, relative to the Vite root. */
  entry?: string
  /** CSS selector the app mounts into. */
  mount?: string
  /** Directory scanned for block SFCs, relative to the Vite root. */
  blocksDir?: string
  /** Directory scanned for `defineWidget` modules, relative to the Vite root. */
  widgetsDir?: string
  /** Directory holding local editor state, relative to the Vite root. */
  mechDir?: string
  /**
   * How the production client build chunks block code.
   *
   * - `'bundled'` (default) — all blocks share one `blocks` chunk: one
   *   request, one compression stream, cached across every page.
   * - `'per-block'` — one chunk per block (the pre-existing behavior); pages
   *   fetch exactly the blocks they use.
   *
   * Either way, a block's `chunk: '<name>'` field carves it (and blocks
   * sharing the name) into its own `blocks-<name>` chunk — use it for heavy,
   * rarely-used blocks. Dev and the SSR build are unaffected (always eager).
   */
  blockChunks?: 'bundled' | 'per-block'
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
  let widgetsDir = ''
  let mechDir = ''
  let userEntry = ''
  let mount = ''
  let root = ''
  let isDev = false
  // The client (non-SSR) production build code-splits blocks: the blocks
  // virtual module becomes dynamic imports and the entry loads per page.
  let isClientBuild = false
  // blockId → source file, captured when the lazy blocks module is generated;
  // emitted as `mechanica-blocks.json` for `mechanica export`.
  let lazyBlockFiles: Map<string, string> | null = null

  // Last compiled `blockSchema` literal per block file (normalized path), so a
  // hot update can tell schema edits (need a re-collect + reload so the editor
  // sees fresh metadata) from template/style edits (normal HMR).
  const blockSchemas = new Map<string, string>()
  // Block file (normalized path) → authored `chunk` group name (null when
  // unmarked). Populated by `transform`, which runs for every block before
  // rolldown assigns chunks, so the codeSplitting `name` callback below can
  // tell block modules apart and group them.
  const blockChunkNames = new Map<string, string | null>()
  const bundleBlocks = (options.blockChunks ?? 'bundled') === 'bundled'

  /** The output chunk group for a block, from its authored `chunk` name. */
  const groupName = (chunk: string | null): string | null =>
    chunk ? `blocks-${chunk}` : bundleBlocks ? 'blocks' : null

  interface ChunkingModuleInfo {
    importers: readonly string[]
    dynamicImporters: readonly string[]
  }
  interface ChunkingCtx {
    getModuleInfo(moduleId: string): ChunkingModuleInfo | null
  }

  /**
   * The group a non-block module belongs to: the blocks' group when every
   * import path into it comes from blocks of one single group, null otherwise
   * (shared with the entry or across groups — default chunking handles it).
   * This folds block-only helpers, components and libraries into the blocks
   * chunk while anything the entry also uses (Vue, the runtime) stays put.
   *
   * `'skip'` means "no constraint from this branch" — a cycle edge back into
   * the current walk. It must stay distinct from null (= keep out of the
   * group), or a diamond import would wrongly evict shared block deps.
   */
  const sharedGroupOf = (id: string, ctx: ChunkingCtx, path: Set<string>): string | null | 'skip' => {
    const info = ctx.getModuleInfo(id)
    if (!info) return null
    // A dynamic-import target is its own chunk entry; leave it alone.
    if (info.dynamicImporters.length > 0) return null
    if (info.importers.length === 0) return null // an entry module
    path.add(id)
    try {
      let group: string | null | 'skip' = 'skip'
      for (const importer of info.importers) {
        let g: string | null | 'skip'
        const own = blockChunkNames.get(slash(importer.split('?')[0]!))
        if (own !== undefined) g = groupName(own)
        else if (path.has(importer)) g = 'skip'
        else g = sharedGroupOf(importer, ctx, path)
        if (g === 'skip') continue
        if (g == null) return null
        if (group === 'skip') group = g
        else if (group !== g) return null
      }
      return group
    } finally {
      path.delete(id)
    }
  }
  const isBlockFile = (file: string): boolean =>
    file.endsWith('.vue') && slash(file).startsWith(slash(blocksDir) + '/')
  const isWidgetFile = (file: string): boolean =>
    /\.(ts|js|mts|mjs)$/.test(file) && slash(file).startsWith(slash(widgetsDir) + '/')

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

  // Re-collect `virtual:mechanica/widgets` and reload when a widget module is
  // added or removed. (Edits to an existing widget file propagate through the
  // module graph on their own — the editor entry takes no HMR, so they reload.)
  const invalidateWidgets = (server: import('vite').ViteDevServer): void => {
    const mod = server.moduleGraph.getModuleById(RESOLVED_WIDGETS_ID)
    if (mod) server.moduleGraph.invalidateModule(mod)
    server.ws.send({ type: 'full-reload' })
  }

  return {
    name: 'mechanica',
    enforce: 'pre',

    config(_config, env) {
      // Group block modules into named output chunks — client build only
      // (dev serves modules individually; the SSR bundle is one file anyway).
      // `name` doubles as the matcher: returning null leaves the module to
      // rolldown's default chunking, so in `per-block` mode unmarked blocks
      // still split one chunk per block via their dynamic imports.
      if (env.command !== 'build' || env.isSsrBuild) return
      return {
        build: {
          rollupOptions: {
            output: {
              codeSplitting: {
                // Membership is decided per module below. The default (true)
                // would pull each block's whole dependency graph — Vue
                // included — into the blocks chunk, inverting the cache
                // story (the stable vendor code must stay in the entry).
                includeDependenciesRecursively: false,
                groups: [
                  {
                    name: (id: string, ctx: ChunkingCtx) => {
                      const own = blockChunkNames.get(slash(id.split('?')[0]!))
                      if (own !== undefined) return groupName(own)
                      const g = sharedGroupOf(id, ctx, new Set())
                      return g === 'skip' ? null : g
                    },
                  },
                ],
              },
            },
          },
        },
      }
    },

    configResolved(config) {
      blocksDir = join(config.root, options.blocksDir ?? 'src/blocks')
      widgetsDir = join(config.root, options.widgetsDir ?? 'src/widgets')
      mechDir = join(config.root, options.mechDir ?? '.mech')
      userEntry = '/' + (options.entry ?? 'src/main.ts').replace(/^\/+/, '')
      mount = options.mount ?? '#app'
      root = config.root
      isDev = config.command === 'serve'
      isClientBuild = config.command === 'build' && !config.build?.ssr
    },

    transform(code, id) {
      const { filename, query } = parseVueRequest(id)
      if (query.vue || !filename.endsWith('.vue')) return
      if (!code.includes('defineBlock')) return

      let result
      try {
        // The production client bundle ships no block metadata: schemas and
        // previewData only feed the editor, the preview route and the SSR-side
        // default-filling — none of which load the client build.
        result = compileBlock(code, filename, { stripMetadata: isClientBuild })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`[mechanica] Failed to compile block: ${message}`)
      }
      if (!result) return
      blockSchemas.set(slash(filename), result.schema)
      blockChunkNames.set(slash(filename), result.chunk)
      return { code: result.code, map: result.map }
    },

    resolveId(id) {
      if (id === BLOCKS_MODULE_ID) return RESOLVED_BLOCKS_ID
      if (id === CLIENT_MODULE_ID) return RESOLVED_CLIENT_ID
      if (id === SSR_MODULE_ID) return RESOLVED_SSR_ID
      if (id === PREVIEW_MODULE_ID) return RESOLVED_PREVIEW_ID
      if (id === WIDGETS_MODULE_ID) return RESOLVED_WIDGETS_ID
    },

    async load(id) {
      if (id === RESOLVED_BLOCKS_ID) {
        // The SSR build and the dev server need every block up front (render
        // any page, palette metadata); only the client build splits.
        if (!isClientBuild) return collectBlocks(blocksDir, (p) => this.resolve(p))
        const lazy = await collectBlocksLazy(blocksDir, (p) => this.resolve(p))
        lazyBlockFiles = lazy.files
        return lazy.code
      }
      if (id === RESOLVED_CLIENT_ID) {
        return generateClientEntry({ userEntry, mount, mode: isDev ? 'dev' : 'client', lazy: isClientBuild })
      }
      if (id === RESOLVED_SSR_ID) {
        return generateSsrEntry({ userEntry })
      }
      if (id === RESOLVED_PREVIEW_ID) {
        return generatePreviewEntry({ userEntry })
      }
      if (id === RESOLVED_WIDGETS_ID) {
        return collectWidgets(widgetsDir, (p) => this.resolve(p))
      }
    },

    generateBundle(_options, bundle) {
      if (!isClientBuild || !lazyBlockFiles) return
      // Which emitted chunk holds each block module. Blocks can share a chunk
      // (`blockChunks: 'bundled'` / the `chunk` field), so the chunk file —
      // not a per-block manifest key — is what `mechanica export` joins on.
      const chunkOfModule = new Map<string, string>()
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const moduleId of output.moduleIds) {
          chunkOfModule.set(slash(moduleId.split('?')[0]!), output.fileName)
        }
      }
      const map = Object.fromEntries(
        [...lazyBlockFiles].map(([blockId, file]) => [
          blockId,
          { src: slash(relative(root, file)), chunk: chunkOfModule.get(slash(file)) ?? null },
        ]),
      )
      this.emitFile({
        type: 'asset',
        fileName: BLOCKS_MANIFEST_FILE,
        source: JSON.stringify(map, null, 2) + '\n',
      })
    },

    configureServer(server) {
      // Registered before the general middleware so `/preview/…` never falls
      // through to the page-CRUD handler.
      server.middlewares.use('/@mechanica/preview', createPreviewMiddleware())
      server.middlewares.use(
        '/@mechanica',
        createDevMiddleware(mechDir, {
          ready: () => ensurePageCodec(server),
          // Block listing for `mechanica thumbs --blocks` — loaded fresh so a
          // re-collected blocks module (HMR add/remove) is reflected.
          blocks: async () => {
            const mod = await server.ssrLoadModule(BLOCKS_MODULE_ID)
            return ((mod.blocksList ?? []) as Parameters<typeof toBlockMeta>[0][]).map((component) => {
              const meta = toBlockMeta(component)
              return { id: meta.id, name: meta.name, hidden: meta.hidden }
            })
          },
        }),
      )
      // Start loading block schemas early so saves convert richText correctly
      // even before the first page render awaits the codec — but only once the
      // server is listening: `configureServer` runs before plugin `buildStart`
      // hooks, and an ssrLoadModule this early compiles .vue blocks before
      // plugin-vue has resolved its compiler. That failed transform is cached
      // as `ssrError` on the module node, so every later attempt rethrows it
      // until the block file is touched (bites every cold start).
      if (server.httpServer && !server.httpServer.listening) {
        server.httpServer.once('listening', () => void ensurePageCodec(server))
      } else {
        void ensurePageCodec(server)
      }

      // Adding or removing a block file re-collects the blocks module and
      // reloads, so new blocks appear in the palette without a server restart.
      server.watcher.on('add', (file) => {
        if (isBlockFile(file)) invalidateBlocks(server)
        else if (isWidgetFile(file)) invalidateWidgets(server)
      })
      server.watcher.on('unlink', (file) => {
        if (isWidgetFile(file)) invalidateWidgets(server)
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
