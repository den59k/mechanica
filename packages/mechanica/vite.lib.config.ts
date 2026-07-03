import { isAbsolute } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgGlob from './src/svg-plugin'

// Browser-side library build: the runtime (`mechanica`), the editor
// (`mechanica/editor` + extracted `mechanica/editor.css`) and the widget API
// (`mechanica/widgets`). All three entries build together on purpose: modules
// they share (src/core — data registry, state, router) land in common chunks,
// so the runtime and the editor see the SAME module instances at runtime.
// Splitting this into separate builds would duplicate module-level state.
//
// `?svg-glob` icons compile in here, so consumers don't need the svgGlob
// plugin registered. `virtual:mechanica/*` imports stay external — they only
// resolve inside the consumer's Vite where the mechanica plugin runs.
export default defineConfig({
  plugins: [
    vue(),
    svgGlob(),
    {
      // Lib mode extracts all CSS into dist/editor.css but nothing imports it.
      // The source entry imports its .scss directly, so mirror that shape:
      // make the compiled editor entry import the extracted stylesheet.
      name: 'mechanica:editor-css-import',
      generateBundle(_options, bundle) {
        const editor = bundle['editor.js']
        if (editor && editor.type === 'chunk') editor.code = `import './editor.css';\n` + editor.code
      },
    },
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        editor: 'src/editor/editor.ts',
        widgets: 'src/editor/widget-api.ts',
      },
      formats: ['es'],
      cssFileName: 'editor',
    },
    rollupOptions: {
      // Externalize every bare specifier (vue, vuewrite, @mechanica/shared, …)
      // and the plugin's virtual modules; bundle only our own relative modules.
      external: (id) => !id.startsWith('.') && !isAbsolute(id),
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
