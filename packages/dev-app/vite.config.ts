import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mechanica, svgGlob } from 'mechanica/plugin'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [
    // siteUrl/siteName feed `{{ site.* }}` templating and, at export, the
    // automatic SEO output (canonical/og:url tags, sitemap.xml, robots.txt).
    mechanica({ siteUrl: 'https://mechanica-demo.example', siteName: 'Mechanica Dev App' }),
    svgGlob(),
    vue(),
  ],
  resolve: {
    // The published package resolves to dist/ (the `import` condition), but
    // dev-app develops mechanica itself: alias the browser-side entry points
    // back to workspace source so editor/runtime changes are live (HMR), with
    // no dist build required. Node-side resolution (this config's own
    // 'mechanica/plugin' import, the CLI) is live via the `bun` export
    // condition — the repo always runs under Bun.
    alias: [
      { find: /^mechanica$/, replacement: src('../mechanica/src/index.ts') },
      { find: /^mechanica\/editor$/, replacement: src('../mechanica/src/editor/editor.ts') },
      { find: /^mechanica\/composer$/, replacement: src('../mechanica/src/editor/composer/composer.ts') },
      { find: /^mechanica\/widgets$/, replacement: src('../mechanica/src/editor/widget-api.ts') },
      { find: /^@mechanica\/shared$/, replacement: src('../shared/src/index.ts') },
      { find: /^@mechanica\/shared\/page-format$/, replacement: src('../shared/src/page-format.ts') },
    ],
  },
  server: {
    host: '127.0.0.1',
  },
})
