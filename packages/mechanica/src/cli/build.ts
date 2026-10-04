import { writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { EDITOR_DIST_DIR, SITE_MANIFEST_FILE } from 'mechanica-shared'
import { buildSiteManifest } from '../server/site'
import { engineVersion } from './platform/engine-version'

/**
 * Produce the client and SSR bundles into `dist/`. Uses the project's
 * `vite.config.ts` (which must register the `mechanica` plugin).
 *
 * The SSR entry is written to a real temp file (rolldown can't use a `\0`
 * virtual module as a build entry) that just re-exports the plugin's virtual
 * SSR module — the plugin generates the actual entry, so its options (user
 * entry, site url/name) all ride the bundle without duplication here.
 */
export async function runBuild(options: { editor?: boolean } = {}): Promise<void> {
  console.info('Building client bundle…')
  // `manifest` maps each module to its emitted chunk + CSS, so `export` can
  // preload exactly the block chunks a page uses (blocks are code-split).
  await build({ build: { outDir: 'dist', emptyOutDir: true, manifest: true } })

  console.info('Building SSR bundle…')
  const ssrEntryPath = join(process.cwd(), 'node_modules/.mechanica/ssr-entry.mjs')
  await mkdir(dirname(ssrEntryPath), { recursive: true })
  await writeFile(ssrEntryPath, `export * from 'virtual:mechanica/ssr'\n`)

  try {
    await build({
      ssr: { noExternal: true },
      build: {
        ssr: ssrEntryPath,
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: { output: { entryFileNames: 'ssr.js', format: 'es' } },
      },
    })
  } finally {
    await rm(ssrEntryPath, { force: true })
  }

  await writeSiteManifest(join(process.cwd(), 'dist'))

  if (options.editor) {
    console.info('Building editor bundle…')
    // The plugin reads this flag: the editor build is the page as the dev
    // server serves it — eager blocks with their full metadata, the runtime in
    // `dev` mode, the editor overlay — so a host can offer editing without Vite.
    // An env flag rather than a Vite `mode`, which would switch the `.env` files.
    process.env.MECHANICA_EDITOR_BUILD = '1'
    try {
      await build({ build: { outDir: join('dist', EDITOR_DIST_DIR), emptyOutDir: true } })
    } finally {
      delete process.env.MECHANICA_EDITOR_BUILD
    }
  }

  console.info('Build complete → dist/')
}

/**
 * Describe the site's code as data (`dist/mechanica-site.json`): block
 * schemas, locales, generated pages — read off the SSR bundle just built. A
 * host that serves the editor for this bundle reads the file instead of
 * running the bundle.
 */
async function writeSiteManifest(distDir: string): Promise<void> {
  // The query busts the module cache: a second build in one process must not
  // describe the previous bundle.
  const ssr = await import(`${pathToFileURL(join(distDir, 'ssr.js')).href}?t=${Date.now()}`)
  const manifest = buildSiteManifest({
    components: ssr.blocksList ?? [],
    composed: ssr.composedList ?? [],
    locales: ssr.locales ?? null,
    generated: ssr.generatedPages ?? [],
    site: ssr.site,
    engine: engineVersion(),
  })
  await writeFile(join(distDir, SITE_MANIFEST_FILE), JSON.stringify(manifest))
}
