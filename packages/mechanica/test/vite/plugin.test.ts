import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { mechanica, BLOCKS_MODULE_ID, WIDGETS_MODULE_ID } from '@/vite/plugin'

const block = `<template><div>{{ props.title }}</div></template>
<script setup lang="ts">
const props = defineBlock({ props: { title: 'string' } })
</script>
`

/** Invoke a Vite hook that may be a function or an `{ handler }` object. */
function callHook(hook: any, ...args: any[]) {
  const fn = typeof hook === 'function' ? hook : hook.handler
  return fn.call({}, ...args)
}

describe('mechanica plugin', () => {
  it('rewrites block SFCs on the main request', () => {
    const out = callHook(mechanica().transform, block, '/abs/Headline.vue')
    expect(out.code).toContain('defineProps')
    expect(out.code).toContain('defineOptions')
    expect(out.code).not.toContain('defineBlock(')
  })

  it('strips block metadata in the client build, keeps it for dev and SSR', () => {
    const client = mechanica()
    callHook(client.configResolved, { root: '/r', command: 'build', build: {} })
    const out = callHook(client.transform, block, '/abs/Headline.vue')
    expect(out.code).toContain('defineProps(["title"])')
    expect(out.code).not.toContain('defineOptions')
    expect(out.code).not.toContain('blockSchema')

    const ssr = mechanica()
    callHook(ssr.configResolved, { root: '/r', command: 'build', build: { ssr: true } })
    expect(callHook(ssr.transform, block, '/abs/Headline.vue').code).toContain('blockSchema')

    const dev = mechanica()
    callHook(dev.configResolved, { root: '/r', command: 'serve' })
    expect(callHook(dev.transform, block, '/abs/Headline.vue').code).toContain('blockSchema')
  })

  it('pins plugin-vue scope ids to the file path so client CSS matches SSR HTML', () => {
    // Production plugin-vue hashes the SFC source into `data-v-*` ids, and
    // block sources differ between the client build (metadata stripped) and
    // the SSR build — path-only ids keep the static HTML styled at first paint.
    const vue = { name: 'vite:vue', api: { options: { features: {} } } }
    callHook(mechanica().configResolved, { root: '/r', command: 'build', build: {}, plugins: [vue] })
    expect((vue.api.options.features as any).componentIdGenerator).toBe('filepath')
  })

  it('respects a user-configured componentIdGenerator', () => {
    const custom = () => 'x'
    const vue = { name: 'vite:vue', api: { options: { features: { componentIdGenerator: custom } } } }
    callHook(mechanica().configResolved, { root: '/r', command: 'build', build: {}, plugins: [vue] })
    expect(vue.api.options.features.componentIdGenerator).toBe(custom)
  })

  it('ignores plugin-vue sub-requests', () => {
    const out = callHook(
      mechanica().transform,
      block,
      '/abs/Headline.vue?vue&type=script&setup=true&lang.ts',
    )
    expect(out).toBeUndefined()
  })
})

describe('block chunk grouping (client build)', () => {
  const chartBlock = `<template><div/></template>
<script setup lang="ts">
const props = defineBlock({ chunk: 'charts', props: { title: 'string' } })
</script>
`

  /** The codeSplitting group `name` callback from the plugin's config hook. */
  function setup(options?: Parameters<typeof mechanica>[0]) {
    const plugin = mechanica(options)
    const cfg = callHook(plugin.config, {}, { command: 'build', isSsrBuild: false })
    callHook(plugin.configResolved, { root: '/r', command: 'build', build: {} })
    callHook(plugin.transform, block, '/abs/Headline.vue')
    callHook(plugin.transform, chartBlock, '/abs/BigChart.vue')
    return cfg.build.rollupOptions.output.codeSplitting.groups[0].name as (
      id: string,
      ctx: { getModuleInfo(id: string): unknown },
    ) => string | null
  }

  /** A ChunkingContext over a static importer graph. */
  const graph = (edges: Record<string, string[]>) => ({
    getModuleInfo: (id: string) =>
      id in edges ? { importers: edges[id], dynamicImporters: [] } : null,
  })

  it('adds the group only to the client build', () => {
    expect(callHook(mechanica().config, {}, { command: 'serve', isSsrBuild: false })).toBeUndefined()
    expect(callHook(mechanica().config, {}, { command: 'build', isSsrBuild: true })).toBeUndefined()
    expect(
      callHook(mechanica().config, {}, { command: 'build', isSsrBuild: false })?.build?.rollupOptions
        ?.output?.codeSplitting?.groups,
    ).toHaveLength(1)
  })

  it('bundles blocks into one chunk; an authored chunk name wins', () => {
    const name = setup()
    const ctx = graph({})
    expect(name('/abs/Headline.vue', ctx)).toBe('blocks')
    expect(name('/abs/BigChart.vue', ctx)).toBe('blocks-charts')
  })

  it('in per-block mode only authored chunk names group', () => {
    const name = setup({ blockChunks: 'per-block' })
    const ctx = graph({})
    expect(name('/abs/Headline.vue', ctx)).toBeNull()
    expect(name('/abs/BigChart.vue', ctx)).toBe('blocks-charts')
  })

  it('folds a dependency in when every import path comes from one group', () => {
    const name = setup()
    const ctx = graph({ '/abs/helper.ts': ['/abs/Headline.vue'] })
    expect(name('/abs/helper.ts', ctx)).toBe('blocks')
  })

  it('keeps a dependency shared with the entry out of the group', () => {
    const name = setup()
    const ctx = graph({
      '/abs/vue.js': ['/abs/entry.ts', '/abs/Headline.vue'],
      '/abs/entry.ts': [],
    })
    expect(name('/abs/vue.js', ctx)).toBeNull()
  })

  it('keeps a dependency shared across two groups out', () => {
    const name = setup()
    const ctx = graph({ '/abs/shared.ts': ['/abs/Headline.vue', '/abs/BigChart.vue'] })
    expect(name('/abs/shared.ts', ctx)).toBeNull()
  })

  it('folds a diamond dependency reached twice through the same blocks', () => {
    // Regression: lib.js is imported by two files that both trace back to the
    // same intermediate module. The second branch re-walks the ancestor (it is
    // not a cycle) — treating it as one used to evict the module wrongly.
    const name = setup()
    const ctx = graph({
      '/abs/lib.js': ['/abs/a.js', '/abs/b.js'],
      '/abs/a.js': ['/abs/mid.ts'],
      '/abs/b.js': ['/abs/mid.ts'],
      '/abs/mid.ts': ['/abs/Headline.vue'],
    })
    expect(name('/abs/lib.js', ctx)).toBe('blocks')
  })

  it('leaves dynamic-import targets and true cycles to default chunking', () => {
    const name = setup()
    const dynamic = {
      getModuleInfo: (id: string) =>
        id === '/abs/lazy.ts' ? { importers: ['/abs/Headline.vue'], dynamicImporters: ['/abs/x.ts'] } : null,
    }
    expect(name('/abs/lazy.ts', dynamic)).toBeNull()
    // A two-module cycle with no outside importer constrains nothing.
    const cyclic = graph({ '/abs/a.ts': ['/abs/b.ts'], '/abs/b.ts': ['/abs/a.ts'] })
    expect(name('/abs/a.ts', cyclic)).toBeNull()
  })
})

describe('mechanica plugin (virtual modules)', () => {
  it('ignores .vue files without defineBlock', () => {
    const out = callHook(mechanica().transform, '<template><div/></template>', '/abs/Plain.vue')
    expect(out).toBeUndefined()
  })

  it('resolves the blocks virtual module', () => {
    const out = callHook(mechanica().resolveId, BLOCKS_MODULE_ID)
    expect(out).toBe('\0' + BLOCKS_MODULE_ID)
  })

  it('resolves the widgets virtual module', () => {
    const out = callHook(mechanica().resolveId, WIDGETS_MODULE_ID)
    expect(out).toBe('\0' + WIDGETS_MODULE_ID)
  })
})

describe('dev HTML injection', () => {
  // No .mech here → readPage returns an empty page; injection still applies.
  const root = tmpdir()

  it('injects state, the client entry and the editor when serving', async () => {
    const plugin = mechanica()
    callHook(plugin.configResolved, { root, command: 'serve' })
    // No ctx.server → codec load is skipped; injection still applies.
    const html = await callHook(plugin.transformIndexHtml, '<html><body></body></html>', { originalUrl: '/' })
    expect(html).toContain('window.state=')
    expect(html).toContain('virtual:mechanica/client')
    expect(html).toContain('mechanica/editor')
  })

  it('omits the editor overlay for ?mechanica-shot page shots', async () => {
    const plugin = mechanica()
    callHook(plugin.configResolved, { root, command: 'serve' })
    const html = await callHook(plugin.transformIndexHtml, '<html><body></body></html>', {
      originalUrl: '/?mechanica-shot=1',
    })
    expect(html).toContain('window.state=')
    expect(html).toContain('virtual:mechanica/client')
    expect(html).not.toContain('mechanica/editor')
  })

  it('injects only the client entry on build (no state, no editor)', async () => {
    const plugin = mechanica()
    callHook(plugin.configResolved, { root, command: 'build' })
    const html = await callHook(plugin.transformIndexHtml, '<body></body>', { originalUrl: '/' })
    expect(html).toContain('virtual:mechanica/client')
    expect(html).not.toContain('window.state')
    expect(html).not.toContain('mechanica/editor')
  })
})
