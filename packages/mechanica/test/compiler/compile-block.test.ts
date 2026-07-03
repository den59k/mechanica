import { describe, it, expect } from 'vitest'
import { parse as parseSfc, compileScript } from '@vue/compiler-sfc'
import { compileBlock, deriveBlockId } from '@/compiler/compile-block'

/** Build a minimal SFC string for tests. */
const sfc = (script: string, template = '<div/>') =>
  `<template>${template}</template>\n<script setup lang="ts">\n${script}\n</script>\n`

describe('deriveBlockId', () => {
  it('kebab-cases the filename', () => {
    expect(deriveBlockId('OurFeatures.vue')).toBe('our-features')
    expect(deriveBlockId('src/blocks/Headline.vue')).toBe('headline')
    expect(deriveBlockId('NewBlock2.vue')).toBe('new-block2')
  })
})

describe('compileBlock', () => {
  it('returns null for files without defineBlock', () => {
    expect(compileBlock(sfc('const x = 1'), 'Foo.vue')).toBeNull()
    expect(compileBlock('<template><div/></template>', 'Foo.vue')).toBeNull()
  })

  it('rewrites defineBlock into defineProps + defineOptions', () => {
    const out = compileBlock(
      sfc(`const props = defineBlock({ props: { title: 'string', subtitle: 'text' } })`),
      'Headline.vue',
    )!
    expect(out).not.toBeNull()
    expect(out.code).toContain('defineProps(["title","subtitle"])')
    expect(out.code).toContain('defineOptions(')
    expect(out.code).toContain('blockId: "headline"')
    expect(out.code).toContain('blockSchema:')
    expect(out.code).not.toContain('defineBlock(')
  })

  it('derives the id from the filename and respects an explicit id', () => {
    expect(compileBlock(sfc(`const p = defineBlock({ props: {} })`), 'OurFeatures.vue')!.blockId).toBe(
      'our-features',
    )
    expect(
      compileBlock(sfc(`const p = defineBlock({ id: 'hero', props: {} })`), 'OurFeatures.vue')!.blockId,
    ).toBe('hero')
  })

  it('preserves previewData in the generated blockSchema', () => {
    const out = compileBlock(
      sfc(`const p = defineBlock({ props: { title: 'string' }, previewData: { title: 'Hello' } })`),
      'Hero.vue',
    )!
    expect(out.code).toContain(`previewData: { title: 'Hello' }`)
    expect(out.schema).toContain('previewData')
  })

  it('auto-detects slots from the template', () => {
    const out = compileBlock(
      sfc(`const p = defineBlock({ props: {} })`, '<div><slot/><slot name="footer"/></div>'),
      'Card.vue',
    )!
    expect(out.code).toContain('slots:')
    expect(out.code).toContain('"default": true')
    expect(out.code).toContain('"footer": true')
  })

  it('does not override author-specified slots', () => {
    const out = compileBlock(
      sfc(`const p = defineBlock({ props: {}, slots: { main: true } })`, '<div><slot/></div>'),
      'Card.vue',
    )!
    expect(out.code).toContain('slots: { main: true }')
    expect(out.code).not.toContain('"default": true')
  })

  it('preserves the authored descriptor inside blockSchema', () => {
    const out = compileBlock(
      sfc(`const p = defineBlock({ name: 'Hero', category: 'Content', props: { title: 'string' } })`),
      'Hero.vue',
    )!
    expect(out.code).toContain(`name: 'Hero'`)
    expect(out.code).toContain(`category: 'Content'`)
    expect(out.code).toContain(`title: 'string'`)
  })

  it('handles a block with no props', () => {
    const out = compileBlock(sfc(`const p = defineBlock({})`), 'Spacer.vue')!
    expect(out.code).toContain('defineProps([])')
    expect(out.code).toContain('blockId: "spacer"')
  })

  // The real proof: the rewritten SFC must compile through @vue/compiler-sfc
  // with the macros intact and our metadata landing on the component.
  it('produces output that compiles through @vue/compiler-sfc', () => {
    const out = compileBlock(
      sfc(
        `const props = defineBlock({ props: { title: 'string' } })`,
        '<div>{{ props.title }}<slot/></div>',
      ),
      'Headline.vue',
    )!

    const { descriptor, errors } = parseSfc(out.code, { filename: 'Headline.vue' })
    expect(errors).toHaveLength(0)

    const script = compileScript(descriptor, { id: 'headline' })
    expect(script.content).toContain('blockId')
    expect(script.content).toContain('blockSchema')
    expect(script.content).toContain('title')
  })

  it('throws on duplicate defineBlock calls', () => {
    const script = `const a = defineBlock({ props: {} })\nconst b = defineBlock({ props: {} })`
    expect(() => compileBlock(sfc(script), 'Twice.vue')).toThrow(/only be called once/)
  })

  it('rewrites a generic defineBlock<T>() call entirely', () => {
    const out = compileBlock(
      sfc(`const p = defineBlock<{ title: string }>({ props: { title: 'string' } })`),
      'Hero.vue',
    )!
    expect(out.code).toContain('defineProps(["title"])')
    expect(out.code).not.toContain('defineBlock')
  })

  describe('stripMetadata (production client build)', () => {
    const source = sfc(
      `const props = defineBlock({ name: 'Hero', category: 'Content', props: { title: 'string' }, previewData: { title: 'Hi' } })`,
      '<div>{{ props.title }}</div>',
    )

    it('emits only defineProps — no schema, previewData or blockId', () => {
      const out = compileBlock(source, 'Hero.vue', { stripMetadata: true })!
      expect(out.code).toContain('defineProps(["title"])')
      expect(out.code).not.toContain('defineOptions')
      expect(out.code).not.toContain('blockSchema')
      expect(out.code).not.toContain('previewData')
      expect(out.code).not.toContain('defineBlock')
    })

    it('still resolves the block id and schema for the caller (manifest, HMR)', () => {
      const out = compileBlock(source, 'Hero.vue', { stripMetadata: true })!
      expect(out.blockId).toBe('hero')
      expect(out.schema).toContain('previewData')
      expect(out.schema).toBe(compileBlock(source, 'Hero.vue')!.schema)
    })

    it('produces output that compiles through @vue/compiler-sfc', () => {
      const out = compileBlock(source, 'Hero.vue', { stripMetadata: true })!
      const { descriptor, errors } = parseSfc(out.code, { filename: 'Hero.vue' })
      expect(errors).toHaveLength(0)
      const script = compileScript(descriptor, { id: 'hero' })
      expect(script.content).toContain('title')
      expect(script.content).not.toContain('blockSchema')
    })
  })

  it('extracts the authored chunk group name', () => {
    const marked = compileBlock(
      sfc(`const p = defineBlock({ chunk: 'charts', props: {} })`),
      'BigChart.vue',
    )!
    expect(marked.chunk).toBe('charts')
    const unmarked = compileBlock(sfc(`const p = defineBlock({ props: {} })`), 'Hero.vue')!
    expect(unmarked.chunk).toBeNull()
  })

  it('exposes the blockSchema literal so callers can diff schemas across edits', () => {
    const one = compileBlock(sfc(`const p = defineBlock({ props: { title: 'string' } })`), 'A.vue')!
    const same = compileBlock(sfc(`const p = defineBlock({ props: { title: 'string' } })`), 'A.vue')!
    const changed = compileBlock(sfc(`const p = defineBlock({ props: { title: 'text' } })`), 'A.vue')!
    expect(one.schema).toContain(`title: 'string'`)
    expect(same.schema).toBe(one.schema)
    expect(changed.schema).not.toBe(one.schema)
  })
})
