import { describe, it, expect } from 'vitest'
import { generateComponentsModule } from '@/vite/collect-components'
import { defineComposer } from '@/core/composer-components'

describe('generateComponentsModule', () => {
  it('degrades to inert exports when there is no manifest', () => {
    const code = generateComponentsModule(null)
    expect(code).toContain('export const registerComponents = (blocks) => blocks')
    expect(code).toContain('export const componentDefs = []')
    expect(code).toContain('export const classDefs = []')
    expect(code).not.toContain('import manifest')
  })

  it('imports the manifest and exposes registration + palette + class metadata', () => {
    const code = generateComponentsModule('/src/composer.ts')
    expect(code).toContain('import manifest from "/src/composer.ts"')
    // Components live under `manifest.components` now (the split manifest).
    expect(code).toContain('const components = manifest.components ?? {}')
    expect(code).toContain('export function registerComponents(blocks)')
    // Only object-form entries with a component are registered as renderers.
    expect(code).toContain("if (entry && typeof entry === 'object' && entry.component) blocks.set(id, entry.component)")
    // String entries re-expose a compiled block, carried through as a `ref`.
    expect(code).toContain('? { id, ref: entry }')
    expect(code).toContain('export const componentDefs = Object.keys(components).map')
    // Classes are normalized for the composer's Style select (imported from
    // `mechanica`, which resolves from a virtual module where `mechanica-shared` can't).
    expect(code).toContain("import { normalizeClassManifest } from 'mechanica'")
    expect(code).toContain('export const classDefs = normalizeClassManifest(manifest.classes)')
  })
})

describe('defineComposer', () => {
  it('returns the manifest unchanged (identity function)', () => {
    const manifest = defineComposer({
      components: {
        button: { component: {}, name: 'Button', props: { label: { type: 'string' } } },
        card: 'card',
      },
      classes: { container: { title: 'Container', on: 'frame' } },
      breakpoints: { md: 960, sm: 600 },
    })
    expect(manifest.components!.button).toMatchObject({ name: 'Button' })
    expect(manifest.components!.card).toBe('card')
    expect(manifest.classes!.container).toMatchObject({ on: 'frame' })
    expect(manifest.breakpoints).toEqual({ md: 960, sm: 600 })
  })
})
