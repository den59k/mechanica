import { isAbsolute } from 'node:path'
import { defineConfig } from 'vite'

// Node-side library build: the Vite plugin (`mechanica/plugin`) and the CLI.
// Bundling rewrites the extensionless relative TS imports into plain JS files
// raw Node ESM can load — this is what frees consumers from requiring Bun.
// Runs after vite.lib.config.ts into the same dist/ (emptyOutDir: false).
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'esnext',
    minify: false,
    lib: {
      entry: {
        plugin: 'src/vite/index.ts',
        cli: 'src/cli/cli.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => !id.startsWith('.') && !isAbsolute(id),
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
