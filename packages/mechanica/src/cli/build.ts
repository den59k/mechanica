import { writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { build } from 'vite'
import { generateSsrEntry } from '../vite/entries'

/**
 * Produce the client and SSR bundles into `dist/`. Uses the project's
 * `vite.config.ts` (which must register the `mechanica` plugin).
 *
 * The SSR entry is written to a real temp file (rolldown can't use a `\0`
 * virtual module as a build entry) that imports the virtual blocks module.
 */
export async function runBuild(options: { entry?: string } = {}): Promise<void> {
  const userEntry = '/' + (options.entry ?? 'src/main.ts').replace(/^\/+/, '')

  console.info('Building client bundle…')
  // `manifest` maps each module to its emitted chunk + CSS, so `export` can
  // preload exactly the block chunks a page uses (blocks are code-split).
  await build({ build: { outDir: 'dist', emptyOutDir: true, manifest: true } })

  console.info('Building SSR bundle…')
  const ssrEntryPath = join(process.cwd(), 'node_modules/.mechanica/ssr-entry.mjs')
  await mkdir(dirname(ssrEntryPath), { recursive: true })
  await writeFile(ssrEntryPath, generateSsrEntry({ userEntry }))

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
