import { build } from 'vite'
import { SSR_MODULE_ID } from '../vite/plugin'

/**
 * Produce the client and SSR bundles into `dist/`. Uses the project's
 * `vite.config.ts` (which must register the `mechanica` plugin).
 */
export async function runBuild(): Promise<void> {
  console.info('Building client bundle…')
  await build({ build: { outDir: 'dist', emptyOutDir: true } })

  console.info('Building SSR bundle…')
  await build({
    ssr: { noExternal: true },
    build: {
      ssr: SSR_MODULE_ID,
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: 'ssr.js', format: 'es' } },
    },
  })

  console.info('Build complete → dist/')
}
