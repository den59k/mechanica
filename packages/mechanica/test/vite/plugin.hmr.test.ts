import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mechanica, BLOCKS_MODULE_ID } from '@/vite/plugin'

const block = (title: string, template = '<h1>hi</h1>') =>
  `<template>${template}</template>\n<script setup lang="ts">\nconst props = defineBlock({ props: { ${title}: 'string' } })\n</script>\n`

// Uses a throwaway root inside the repo so `vue` still resolves, and drives the
// watcher / hot-update hooks directly instead of waiting on chokidar.
describe('mechanica plugin (dev HMR)', () => {
  let root: string
  let server: ViteDevServer

  beforeEach(async () => {
    root = fs.mkdtempSync(join(import.meta.dirname, 'hmr-fixture-'))
    fs.mkdirSync(join(root, 'src/blocks'), { recursive: true })
    fs.writeFileSync(join(root, 'src/blocks/Headline.vue'), block('title'))

    server = await createServer({
      root,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      plugins: [mechanica(), vue()],
    })
  })

  afterEach(async () => {
    await server.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const blocksModule = async () => (await server.transformRequest(BLOCKS_MODULE_ID))!.code

  it('re-collects the blocks module when a block file is added or removed', async () => {
    expect(await blocksModule()).toContain('Headline.vue')

    const sendSpy = vi.spyOn(server.ws, 'send')
    const added = join(root, 'src/blocks/Promo.vue')
    fs.writeFileSync(added, block('heading'))
    server.watcher.emit('add', added)

    expect(sendSpy).toHaveBeenCalledWith({ type: 'full-reload' })
    expect(await blocksModule()).toContain('Promo.vue')

    fs.rmSync(added)
    server.watcher.emit('unlink', added)
    expect(await blocksModule()).not.toContain('Promo.vue')
  })

  it('full-reloads on schema changes but not on template-only changes', async () => {
    const file = join(root, 'src/blocks/Headline.vue')
    // Transform once so the plugin has the block's schema on record.
    await server.transformRequest('/src/blocks/Headline.vue')

    const plugin = server.config.plugins.find((p) => p.name === 'mechanica')!
    const hotUpdate = (code: string) =>
      (plugin.handleHotUpdate as any).call(
        {},
        { file, server, modules: [], timestamp: Date.now(), read: async () => code },
      )

    const sendSpy = vi.spyOn(server.ws, 'send')

    // Template-only edit: schema unchanged, normal HMR (no reload).
    await hotUpdate(block('title', '<h2>changed</h2>'))
    expect(sendSpy).not.toHaveBeenCalledWith({ type: 'full-reload' })

    // Schema edit: the editor needs fresh metadata → full reload.
    await hotUpdate(block('subtitle'))
    expect(sendSpy).toHaveBeenCalledWith({ type: 'full-reload' })
  })

  it('reports a clear plugin error for a broken block', async () => {
    const file = join(root, 'src/blocks/Broken.vue')
    fs.writeFileSync(
      file,
      `<template><div/></template>\n<script setup lang="ts">\nconst a = defineBlock({})\nconst b = defineBlock({})\n</script>\n`,
    )
    await expect(server.transformRequest('/src/blocks/Broken.vue')).rejects.toThrow(
      /defineBlock\(\) may only be called once/,
    )
  })

  it('ignores mid-edit syntax errors instead of breaking HMR', async () => {
    const file = join(root, 'src/blocks/Headline.vue')
    await server.transformRequest('/src/blocks/Headline.vue')

    const plugin = server.config.plugins.find((p) => p.name === 'mechanica')!
    const sendSpy = vi.spyOn(server.ws, 'send')
    await (plugin.handleHotUpdate as any).call(
      {},
      {
        file,
        server,
        modules: [],
        timestamp: Date.now(),
        read: async () => '<script setup lang="ts">const p = defineBlock({{{</script>',
      },
    )
    expect(sendSpy).not.toHaveBeenCalledWith({ type: 'full-reload' })
  })
})
