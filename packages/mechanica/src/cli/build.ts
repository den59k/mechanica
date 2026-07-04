import { writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { build } from 'vite'

/**
 * Produce the client and SSR bundles into `dist/`. Uses the project's
 * `vite.config.ts` (which must register the `mechanica` plugin).
 *
 * The SSR entry is written to a real temp file (rolldown can't use a `\0`
 * virtual module as a build entry) that just re-exports the plugin's virtual
 * SSR module — the plugin generates the actual entry, so its options (user
 * entry, site url/name) all ride the bundle without duplication here.
 */
export async function runBuild(): Promise<void> {
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

  console.info('Build complete → dist/')
}
