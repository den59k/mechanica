import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { mechanica, BLOCKS_MODULE_ID } from '@/vite/plugin'

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

  it('ignores plugin-vue sub-requests', () => {
    const out = callHook(
      mechanica().transform,
      block,
      '/abs/Headline.vue?vue&type=script&setup=true&lang.ts',
    )
    expect(out).toBeUndefined()
  })

  it('ignores .vue files without defineBlock', () => {
    const out = callHook(mechanica().transform, '<template><div/></template>', '/abs/Plain.vue')
    expect(out).toBeUndefined()
  })

  it('resolves the blocks virtual module', () => {
    const out = callHook(mechanica().resolveId, BLOCKS_MODULE_ID)
    expect(out).toBe('\0' + BLOCKS_MODULE_ID)
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
