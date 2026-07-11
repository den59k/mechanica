/**
 * Generate the composer elements' **responsive** stylesheet — the var-consuming
 * property rules that `elements.scss` used to hold statically. It moved here
 * because the media-query widths are now configurable (`defineComposer`'s
 * `breakpoints`), and CSS media queries can't read a custom property. The plugin
 * serves the result as `virtual:mechanica/elements.css`; the structural rules and
 * the `@property` registrations stay in `elements.scss`. Pure and unit-tested.
 *
 * Three-rung cascade (see COMPOSER-MANIFEST.md § 4) so a site's design-system
 * classes can style elements while an explicit inspector knob still wins:
 *  1. **Floor** — the default, wrapped in `@layer mechanica`, so any unlayered
 *     author class (`.container`, `.h1`) outranks it.
 *  2. **Class** — the developer's own site CSS (not emitted here).
 *  3. **Knob** — an unlayered `[style*='--el-x:']` rung that matches only when the
 *     inline var is actually set at that breakpoint, so a set knob beats a class.
 *
 * Structural / flex props (`w h grow self dir align justify wrap`) are the
 * composer's own model, not a design-system concern: they emit a single
 * unlayered floor and no knob rung, so classes can't reach them.
 */

import type { ComposerBreakpoints } from 'mechanica-shared'

/** The default element breakpoints (max-widths, px) when the site sets none. */
export const DEFAULT_ELEMENT_BREAKPOINTS: ComposerBreakpoints = { md: 1024, sm: 640 }

type Selector = '.mxel' | '.mxel-frame' | '.mxel-text' | '.mxel-image' | '.mxel-slot'
type Suffix = '' | '-md' | '-sm'

interface Binding {
  /** The element selector the rule targets. */
  selector: Selector
  /** The CSS property to set. */
  prop: string
  /** The custom-property base name (without the `--` prefix or breakpoint suffix). */
  varBase: string
  /** The value when the knob (and every wider one) is unset. */
  fallback: string
  /** `yield` = classes may override it (layered floor + knob rung); `hard` = a
   *  plain unlayered floor, no rung (structural / flex model). */
  tier: 'yield' | 'hard'
  /** Wrap the resolved value (the image max-width cap, the bg-image overlay). */
  wrap?: (expr: string, suffix: Suffix) => string
}

const capImage = (expr: string): string => `min(${expr}, 100%)`

// The background image composes with the optional `--el-bgoverlay` color: a
// same-color gradient painted over the url. Unset overlay = transparent (a
// no-op); overlay without an image paints a plain translucent layer.
const withOverlay = (expr: string, suffix: Suffix): string => {
  const overlay = fallbackChain('el-bgoverlay', suffix, 'transparent')
  return `linear-gradient(${overlay}, ${overlay}), ${expr}`
}

/**
 * The single source of truth for the elements' responsive property rules — the
 * exact declarations `elements.scss` carried, split by tier. Kept in step with
 * `style-vars.ts`'s var specs by a drift test (every spec `cssVar` appears here).
 */
const BINDINGS: Binding[] = [
  // ── .mxel (shared across kinds) ──────────────────────────────────────
  { selector: '.mxel', prop: 'width', varBase: 'el-w', fallback: 'auto', tier: 'hard' },
  { selector: '.mxel', prop: 'height', varBase: 'el-h', fallback: 'auto', tier: 'hard' },
  { selector: '.mxel', prop: 'flex-grow', varBase: 'el-grow', fallback: '0', tier: 'hard' },
  { selector: '.mxel', prop: 'align-self', varBase: 'el-self', fallback: 'auto', tier: 'hard' },
  { selector: '.mxel', prop: 'margin', varBase: 'el-margin', fallback: '0', tier: 'yield' },
  { selector: '.mxel', prop: 'border-radius', varBase: 'el-radius', fallback: '0', tier: 'yield' },
  { selector: '.mxel', prop: 'min-width', varBase: 'el-minw', fallback: '0', tier: 'yield' },
  { selector: '.mxel', prop: 'min-height', varBase: 'el-minh', fallback: 'auto', tier: 'yield' },
  { selector: '.mxel', prop: 'max-height', varBase: 'el-maxh', fallback: 'none', tier: 'yield' },
  // ── .mxel-frame ──────────────────────────────────────────────────────
  { selector: '.mxel-frame', prop: 'flex-direction', varBase: 'el-dir', fallback: 'column', tier: 'hard' },
  { selector: '.mxel-frame', prop: 'align-items', varBase: 'el-align', fallback: 'stretch', tier: 'hard' },
  { selector: '.mxel-frame', prop: 'justify-content', varBase: 'el-justify', fallback: 'flex-start', tier: 'hard' },
  { selector: '.mxel-frame', prop: 'flex-wrap', varBase: 'el-wrap', fallback: 'nowrap', tier: 'hard' },
  { selector: '.mxel-frame', prop: 'gap', varBase: 'el-gap', fallback: '0px', tier: 'yield' },
  { selector: '.mxel-frame', prop: 'padding', varBase: 'el-pad', fallback: '0px', tier: 'yield' },
  { selector: '.mxel-frame', prop: 'max-width', varBase: 'el-maxw', fallback: 'none', tier: 'yield' },
  { selector: '.mxel-frame', prop: 'background', varBase: 'el-bg', fallback: 'none', tier: 'yield' },
  // Background-image fill — MUST come after the `background` shorthand so the
  // image (and its overlay gradient) survives a color fill set alongside it.
  { selector: '.mxel-frame', prop: 'background-image', varBase: 'el-bgimg', fallback: 'none', tier: 'yield', wrap: withOverlay },
  { selector: '.mxel-frame', prop: 'background-position', varBase: 'el-bgpos', fallback: '50% 50%', tier: 'yield' },
  { selector: '.mxel-frame', prop: 'box-shadow', varBase: 'el-shadow', fallback: 'none', tier: 'yield' },
  // ── visibility (the `hide` knob) — the floor restates each kind's static
  // display, so only an actually-set `--el-display` knob changes anything. ────
  { selector: '.mxel-frame', prop: 'display', varBase: 'el-display', fallback: 'flex', tier: 'yield' },
  { selector: '.mxel-text', prop: 'display', varBase: 'el-display', fallback: 'block', tier: 'yield' },
  { selector: '.mxel-image', prop: 'display', varBase: 'el-display', fallback: 'block', tier: 'yield' },
  { selector: '.mxel-slot', prop: 'display', varBase: 'el-display', fallback: 'block', tier: 'yield' },
  // ── .mxel-text ───────────────────────────────────────────────────────
  { selector: '.mxel-text', prop: 'text-align', varBase: 'el-text-align', fallback: 'left', tier: 'yield' },
  { selector: '.mxel-text', prop: 'font-size', varBase: 'el-fs', fallback: 'revert', tier: 'yield' },
  { selector: '.mxel-text', prop: 'font-weight', varBase: 'el-fw', fallback: 'revert', tier: 'yield' },
  { selector: '.mxel-text', prop: 'line-height', varBase: 'el-lh', fallback: 'revert', tier: 'yield' },
  { selector: '.mxel-text', prop: 'color', varBase: 'el-color', fallback: 'currentcolor', tier: 'yield' },
  { selector: '.mxel-text', prop: 'max-width', varBase: 'el-maxw', fallback: 'none', tier: 'yield' },
  // ── .mxel-image (max-width caps at 100% even with a knob) ─────────────
  { selector: '.mxel-image', prop: 'max-width', varBase: 'el-maxw', fallback: '100%', tier: 'yield', wrap: capImage },
  { selector: '.mxel-image', prop: 'object-fit', varBase: 'el-fit', fallback: 'cover', tier: 'yield' },
  { selector: '.mxel-image', prop: 'aspect-ratio', varBase: 'el-ratio', fallback: 'auto', tier: 'yield' },
]

const SELECTOR_ORDER: Selector[] = ['.mxel', '.mxel-frame', '.mxel-text', '.mxel-image', '.mxel-slot']

/** The var-name bases the emitted CSS reads — exported for the style-vars drift test.
 *  `el-bgoverlay` has no binding of its own (it rides inside the bg-image wrap). */
export const ELEMENT_CSS_VAR_BASES: string[] = [...BINDINGS.map((b) => b.varBase), 'el-bgoverlay']

/** `var(--el-x[-bp], var(--el-x, fallback))` — narrower breakpoints fall back to wider. */
function fallbackChain(varBase: string, suffix: Suffix, fallback: string): string {
  if (suffix === '') return `var(--${varBase}, ${fallback})`
  if (suffix === '-md') return `var(--${varBase}-md, var(--${varBase}, ${fallback}))`
  return `var(--${varBase}-sm, var(--${varBase}-md, var(--${varBase}, ${fallback})))`
}

/** Group a tier's floors for one suffix into `selector { prop: value; … }` rules. */
function floorRules(suffix: Suffix, tier: 'yield' | 'hard', indent: string): string {
  const out: string[] = []
  for (const selector of SELECTOR_ORDER) {
    const decls = BINDINGS.filter((b) => b.selector === selector && b.tier === tier).map((b) => {
      const expr = fallbackChain(b.varBase, suffix, b.fallback)
      return `${indent}  ${b.prop}: ${b.wrap ? b.wrap(expr, suffix) : expr};`
    })
    if (decls.length) out.push(`${indent}${selector} {\n${decls.join('\n')}\n${indent}}`)
  }
  return out.join('\n')
}

/** The unlayered knob rungs (yield props only) for one suffix. */
function knobRules(suffix: Suffix, indent: string): string {
  return BINDINGS.filter((b) => b.tier === 'yield')
    .map((b) => {
      const value = `var(--${b.varBase}${suffix})`
      const wrapped = b.wrap ? b.wrap(value, suffix) : value
      return `${indent}${b.selector}[style*='--${b.varBase}${suffix}:'] { ${b.prop}: ${wrapped}; }`
    })
    .join('\n')
}

/** The full rule set for one breakpoint: hard floors, layered yield floors, knob rungs. */
function tierBlock(suffix: Suffix, indent: string): string {
  return [
    floorRules(suffix, 'hard', indent),
    `${indent}@layer mechanica {`,
    floorRules(suffix, 'yield', indent + '  '),
    `${indent}}`,
    knobRules(suffix, indent),
  ].join('\n')
}

/**
 * Emit the elements' responsive stylesheet for the given breakpoints. Behavior-
 * equivalent to the old `elements.scss` responsive section at the default widths,
 * plus the `@layer`/knob-rung cascade that lets design-system classes participate.
 */
export function emitElementsCss(breakpoints: ComposerBreakpoints = DEFAULT_ELEMENT_BREAKPOINTS): string {
  return [
    '/* Generated by mechanica — composer element responsive rules. Do not edit. */',
    tierBlock('', ''),
    '',
    `@media (max-width: ${breakpoints.md}px) {`,
    tierBlock('-md', '  '),
    '}',
    '',
    `@media (max-width: ${breakpoints.sm}px) {`,
    tierBlock('-sm', '  '),
    '}',
    '',
  ].join('\n')
}
