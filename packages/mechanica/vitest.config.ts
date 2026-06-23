import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Resolve the workspace package to its source for tests (mirrors the tsconfig
// `paths` mapping used by tsc).
const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@mechanica/shared': sharedSrc,
    },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@mechanica/shared': sharedSrc } },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts', '**/node_modules/**'],
        },
      },
      {
        resolve: { alias: { '@mechanica/shared': sharedSrc } },
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
