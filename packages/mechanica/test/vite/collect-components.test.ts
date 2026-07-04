import { describe, it, expect } from 'vitest'
import { generateComponentsModule } from '@/vite/collect-components'
import { defineComposerComponents } from '@/core/composer-components'

describe('generateComponentsModule', () => {
  it('degrades to inert exports when there is no manifest', () => {
    const code = generateComponentsModule(null)
    expect(code).toContain('export const registerComponents = (blocks) => blocks')
    expect(code).toContain('export const componentDefs = []')
    expect(code).not.toContain('import manifest')
  })

  it('imports the manifest and exposes registration + palette metadata', () => {
    const code = generateComponentsModule('/src/composer.ts')
    expect(code).toContain('import manifest from "/src/composer.ts"')
    expect(code).toContain('export function registerComponents(blocks)')
    // Only object-form entries with a component are registered as renderers.
    expect(code).toContain("if (entry && typeof entry === 'object' && entry.component) blocks.set(id, entry.component)")
    // String entries re-expose a compiled block, carried through as a `ref`.
    expect(code).toContain('? { id, ref: entry }')
    expect(code).toContain('export const componentDefs = Object.keys(manifest).map')
  })
})

describe('defineComposerComponents', () => {
  it('returns the manifest unchanged (identity function)', () => {
    const manifest = defineComposerComponents({
      button: { component: {}, name: 'Button', props: { label: { type: 'string' } } },
      card: 'card',
    })
    expect(manifest.button).toMatchObject({ name: 'Button' })
    expect(manifest.card).toBe('card')
  })
})
