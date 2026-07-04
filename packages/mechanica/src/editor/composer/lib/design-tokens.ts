/** A CSS custom-property color token found in the site's stylesheets. */
export interface ColorToken {
  name: string
  value: string
}

let cache: ColorToken[] | null = null

/** Editor/runtime-internal token prefixes to exclude from the picker. */
const INTERNAL = /^(mech|el|vw)-/

const COLORISH = /^(#|rgb|hsl|color\()/i

/**
 * The site's design-token colors: `--*` custom properties declared on `:root`
 * with a color value, scanned once from the loaded stylesheets. The composer
 * page imports the user's global CSS, so their tokens are available here — the
 * color inputs offer them first, keeping composed blocks on the design system
 * instead of ad-hoc hex. Editor/element-internal tokens are filtered out.
 */
export function colorTokens(): ColorToken[] {
  if (cache) return cache
  const found = new Map<string, string>()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet — not readable
    }
    for (const rule of Array.from(rules ?? [])) {
      if (!(rule instanceof CSSStyleRule) || !/:root\b/.test(rule.selectorText)) continue
      const style = rule.style
      for (let i = 0; i < style.length; i++) {
        const prop = style[i]!
        if (!prop.startsWith('--')) continue
        const name = prop.slice(2)
        if (INTERNAL.test(name)) continue
        const value = style.getPropertyValue(prop).trim()
        if (COLORISH.test(value)) found.set(name, value)
      }
    }
  }
  cache = [...found].map(([name, value]) => ({ name, value })).slice(0, 24)
  return cache
}
