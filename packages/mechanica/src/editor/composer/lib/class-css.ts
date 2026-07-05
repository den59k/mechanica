/**
 * Read the CSS declarations a site design-system class actually provides, off the
 * **live CSSOM** — the composer page already loads the site's stylesheet, so the
 * Style select can preview what "Container" / "Panel" apply. Editor-only (touches
 * `document.styleSheets`); never ships to the site build.
 *
 * Scope: the *base* `.class` rule(s). Cross-origin sheets (e.g. Google Fonts) are
 * skipped (their `cssRules` throw); pseudo-classes, descendant-scoped rules and
 * `@media` overrides are intentionally not merged in — the base declarations are
 * what a designer wants to see. `var(--token)` values are resolved against `:root`
 * for a readable hint alongside the authored value. See COMPOSER-MANIFEST.md.
 */

export interface ClassDeclaration {
  /** The CSS property name, as authored. */
  prop: string
  /** The authored value (may contain `var(…)`). */
  value: string
  /** The value with `var(--token)` substituted from `:root`, when it differs. */
  resolved?: string
}

/** Whether a rule's (possibly comma-listed) selector targets exactly `.className`. */
export function selectorTargets(selectorText: string, selector: string): boolean {
  return selectorText.split(',').some((part) => part.trim() === selector)
}

/**
 * Split a rule's authored declaration block into `{ prop, value }` pairs, keeping
 * the developer's **shorthands** (`margin-inline: auto`, `border: 1px solid …`)
 * rather than the CSSOM's longhand expansion. Splits on top-level `;` / `:` only
 * (paren-depth-aware, so `var(…)` / `rgb(…)` / `url(…;…)` stay intact).
 */
export function parseDeclarations(cssText: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i <= cssText.length; i++) {
    const ch = cssText[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (i === cssText.length || (ch === ';' && depth === 0)) {
      const decl = cssText.slice(start, i).trim()
      start = i + 1
      const colon = decl.indexOf(':')
      if (colon <= 0) continue
      const prop = decl.slice(0, colon).trim()
      const value = decl.slice(colon + 1).trim()
      if (prop && value) out.push({ prop, value })
    }
  }
  return out
}

/**
 * Rewrite bare `rgb(r, g, b)` back to `#rrggbb` — the CSSOM canonicalizes an
 * authored hex/named color to `rgb(…)` when it serializes a declaration, so this
 * restores the hex the developer wrote. `rgba(…)` is left alone (it's normally
 * authored as `rgba` on purpose, and the alpha has no plain-hex form here).
 */
export function rgbToHex(value: string): string {
  return value.replace(/rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi, (_m, r: string, g: string, b: string) =>
    '#' + [r, g, b].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join(''),
  )
}

/** Substitute `var(--token[, fallback])` occurrences from a root style declaration. */
export function resolveVars(value: string, rootStyle: Pick<CSSStyleDeclaration, 'getPropertyValue'>): string {
  if (!value.includes('var(')) return value
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_match, name: string, fallback?: string) => {
    const resolved = rootStyle.getPropertyValue(name).trim()
    return resolved || fallback?.trim() || `var(${name})`
  })
}

/** The declared properties (base rule) of a design-system class, deduped last-wins. */
export function readClassDeclarations(className: string): ClassDeclaration[] {
  if (!className || typeof document === 'undefined') return []
  const selector = '.' + className
  const merged = new Map<string, string>()

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules // throws for cross-origin sheets
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule) || !selectorTargets(rule.selectorText, selector)) continue
      for (const { prop, value } of parseDeclarations(rule.style.cssText)) merged.set(prop, value)
    }
  }

  const rootStyle = getComputedStyle(document.documentElement)
  return Array.from(merged, ([prop, raw]) => {
    // Show hex, not the CSSOM's `rgb(…)`, for both the authored value and any
    // var-resolved one (a token may itself resolve to an rgb color).
    const value = rgbToHex(raw)
    const resolved = rgbToHex(resolveVars(raw, rootStyle))
    return resolved !== value ? { prop, value, resolved } : { prop, value }
  })
}
