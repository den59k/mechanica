import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Compiler, dev server and other Node-side logic.
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts', '**/node_modules/**'],
        },
      },
      {
        // Runtime, editor and component tests (added from Phase 3 on).
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
