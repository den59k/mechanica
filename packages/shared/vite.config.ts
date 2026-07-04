import { defineConfig } from 'vite'

// Library build → dist/. All entries in one build so modules they share
// (schema helpers, the field registry) land in a common chunk — one instance
// at runtime, never two copies of the registry.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        'page-format': 'src/page-format.ts',
        'block-format': 'src/block-format.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['compact-json-schema', 'yaml'],
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
