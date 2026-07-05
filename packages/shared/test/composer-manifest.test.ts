import { describe, it, expect } from 'vitest'
import { normalizeClassManifest } from '@/composer-manifest'

describe('normalizeClassManifest', () => {
  it('returns [] for an absent classes record', () => {
    expect(normalizeClassManifest(undefined)).toEqual([])
  })

  it('unfolds the full, string, and array shorthands with a default title', () => {
    const defs = normalizeClassManifest({
      container: { title: 'Container', on: 'frame' },
      lead: 'text',
      rounded: ['frame', 'image'],
      both: { on: ['text', 'image'] },
    })
    expect(defs).toEqual([
      { cls: 'container', title: 'Container', kinds: ['frame'] },
      { cls: 'lead', title: 'lead', kinds: ['text'] },
      { cls: 'rounded', title: 'rounded', kinds: ['frame', 'image'] },
      { cls: 'both', title: 'both', kinds: ['text', 'image'] },
    ])
  })

  it('carries a group only when declared (full form)', () => {
    const defs = normalizeClassManifest({
      panel: { title: 'Panel', on: 'frame', group: 'surface' },
      plain: { title: 'Plain', on: 'frame' },
    })
    expect(defs).toEqual([
      { cls: 'panel', title: 'Panel', kinds: ['frame'], group: 'surface' },
      { cls: 'plain', title: 'Plain', kinds: ['frame'] },
    ])
  })

  it('drops entries with no valid kind and dedupes kinds', () => {
    const defs = normalizeClassManifest({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      junk: 'bogus' as any,
      dup: ['frame', 'frame', 'text'],
    })
    expect(defs).toEqual([{ cls: 'dup', title: 'dup', kinds: ['frame', 'text'] }])
  })
})
