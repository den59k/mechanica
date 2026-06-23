import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Phase 0: the block compiler is pure Node logic. The jsdom project for
    // runtime/editor tests is added in Phase 1.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
