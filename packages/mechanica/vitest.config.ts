import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Resolve the workspace package to its source for tests (mirrors the tsconfig
// `paths` mapping used by tsc).
const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
const alias = { '@mechanica/shared': sharedSrc }

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts', '**/node_modules/**'],
        },
      },
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.dom.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
})
