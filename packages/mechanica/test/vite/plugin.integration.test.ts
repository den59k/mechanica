import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mechanica } from '@/vite/plugin'

// The real end-to-end check: a block SFC must flow through our enforce:'pre'
// transform and then @vitejs/plugin-vue, on Vite 8, with our metadata landing
// on the compiled component.
describe('mechanica plugin (Vite integration)', () => {
  it('compiles a block through the full Vite + plugin-vue pipeline', async () => {
    const server = await createServer({
      root: join(import.meta.dirname, '../fixtures'),
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      // The fixture imports from 'mechanica'. Resolve it to source, like
      // dev-app does: the package's own exports point at dist/, which a fresh
      // checkout (CI) hasn't built.
      resolve: { alias: { mechanica: join(import.meta.dirname, '../../src/index.ts') } },
      plugins: [mechanica(), vue()],
    })

    try {
      const result = await server.transformRequest('/blocks/Headline.vue')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('blockId')
      expect(result!.code).toContain('blockSchema')
      // defineBlock has been compiled away.
      expect(result!.code).not.toContain('defineBlock(')
    } finally {
      await server.close()
    }
  })
})
