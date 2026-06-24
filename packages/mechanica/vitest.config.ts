import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import svgGlob from './src/svg-plugin'

// Tests live under test/ and import source via the @/ alias; @mechanica/shared
// resolves to its source (mirrors the tsconfig `paths`).
const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const alias = { '@mechanica/shared': sharedSrc, '@': srcDir }

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [vue(), svgGlob()],
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.dom.test.ts', '**/node_modules/**'],
        },
      },
      {
        plugins: [vue(), svgGlob()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['test/**/*.dom.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
})
