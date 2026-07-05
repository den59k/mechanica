import { describe, it, expect } from 'vitest'
import { parseComposerBreakpoints } from '@/vite/read-breakpoints'

describe('parseComposerBreakpoints', () => {
  it('falls back to defaults for null / no declaration', () => {
    expect(parseComposerBreakpoints(null)).toEqual({ md: 1024, sm: 640 })
    expect(parseComposerBreakpoints('export default defineComposer({ components: {} })')).toEqual({ md: 1024, sm: 640 })
  })

  it('reads numeric literals, tolerating whitespace and trailing commas', () => {
    const source = `export default defineComposer({
      breakpoints: {
        md: 900,
        sm: 560,
      },
    })`
    expect(parseComposerBreakpoints(source)).toEqual({ md: 900, sm: 560 })
  })

  it('fills a missing field from the defaults', () => {
    expect(parseComposerBreakpoints('breakpoints: { md: 900 }')).toEqual({ md: 900, sm: 640 })
  })

  it('warns and uses defaults when the values are invalid (sm >= md)', () => {
    const result = parseComposerBreakpoints('breakpoints: { md: 500, sm: 800 }')
    expect(result.md).toBe(1024)
    expect(result.sm).toBe(640)
    expect(result.warning).toMatch(/invalid breakpoints/)
  })

  it('warns and uses defaults for a non-positive value', () => {
    const result = parseComposerBreakpoints('breakpoints: { md: 0, sm: 0 }')
    expect(result).toMatchObject({ md: 1024, sm: 640 })
    expect(result.warning).toBeTruthy()
  })
})
