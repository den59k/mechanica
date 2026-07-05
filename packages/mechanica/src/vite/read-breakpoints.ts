import type { ComposerBreakpoints } from 'mechanica-shared'
import { DEFAULT_ELEMENT_BREAKPOINTS } from '../elements/emit-css'

/**
 * Statically extract the composer manifest's `breakpoints` from its SOURCE — the
 * plugin can't evaluate `src/composer.ts` (it imports Vue SFCs), and the widths
 * must feed the generated element CSS media queries + the composer device
 * switcher. So, like the `defineBlock` macro and workflow `meta`, the value must
 * be a plain object of numeric literals: `breakpoints: { md: 900, sm: 560 }` — no
 * imports, spreads or computed values. Pure and unit-tested. See COMPOSER-MANIFEST.md § 6.
 *
 * Returns the resolved widths (per-field fall back to the defaults) plus an
 * optional `warning` when a declared value was unusable (non-number, or `sm >= md`),
 * so the plugin can log once and carry on with defaults.
 */
export interface BreakpointsResult extends ComposerBreakpoints {
  warning?: string
}

export function parseComposerBreakpoints(source: string | null): BreakpointsResult {
  const defaults = DEFAULT_ELEMENT_BREAKPOINTS
  if (!source) return { ...defaults }

  // The `breakpoints: { … }` object literal. Values are numbers, so a single
  // brace pair with no nesting — a tolerant, comment-surviving grab of the body.
  const block = source.match(/\bbreakpoints\s*:\s*\{([^{}]*)\}/)
  if (!block) return { ...defaults }
  const body = block[1]!

  const field = (name: 'md' | 'sm'): number | null => {
    const m = body.match(new RegExp(`\\b${name}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`))
    return m ? Number(m[1]) : null
  }
  const mdRaw = field('md')
  const smRaw = field('sm')
  const md = mdRaw ?? defaults.md
  const sm = smRaw ?? defaults.sm

  // Both must be positive and ordered (a narrower breakpoint below the wider one).
  if (!(md > 0 && sm > 0 && sm < md)) {
    return {
      ...defaults,
      warning: `invalid breakpoints { md: ${mdRaw ?? defaults.md}, sm: ${smRaw ?? defaults.sm} } — need 0 < sm < md; using defaults`,
    }
  }
  return { md, sm }
}
