/**
 * Finding the element behind a section selector (`mechanica shot --section`,
 * `BrowserPage.sectionClip`): the lookup that runs in the page, and the pure
 * helpers that prepare its arguments.
 *
 * - **Shadow DOM.** Design handoffs render their sections inside custom
 *   elements with open shadow roots, where `document.querySelector` sees
 *   nothing. The lookup tries the document first, then every open shadow root
 *   in tree order (depth first), matching the selector within each root.
 *   Slotted content belongs to its host's tree, so that tree's query covers
 *   it. `host >>> inner` crosses into the shadow root of `host` explicitly.
 * - **Block ids.** Mechanica renders a block with `data-block-id="<node id>"`
 *   and no `id`, so a bare `#hero` (or `hero`) that matches nothing falls back
 *   to `[data-block-id="hero"]`.
 */

/** Crosses into the shadow root of the elements matched by the part before it. */
export const SHADOW_COMBINATOR = '>>>'

/**
 * Split a selector at `>>>` into trimmed parts (one part when there is none).
 * A `>>>` inside quotes, brackets or parentheses, or after a backslash, is
 * part of the selector. Throws when a part is empty (`>>> .a`, `.a >>>`).
 */
export function splitShadowSelector(selector: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]!
    if (char === '\\') {
      i++
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '[' || char === '(') depth++
    else if ((char === ']' || char === ')') && depth > 0) depth--
    else if (depth === 0 && selector.startsWith(SHADOW_COMBINATOR, i)) {
      parts.push(selector.slice(start, i).trim())
      i += SHADOW_COMBINATOR.length - 1
      start = i + 1
    }
  }
  parts.push(selector.slice(start).trim())
  if (parts.some((part) => !part)) throw new Error(`empty selector around "${SHADOW_COMBINATOR}"`)
  return parts
}

/**
 * The block-id selector to try when a bare `#name` or `name` matches nothing:
 * `[data-block-id="name"]`. Null for any other selector. A name that is not a
 * valid CSS id (`#1hero`) still gets one, so block ids starting with a digit
 * are reachable too.
 */
export function blockIdFallback(selector: string): string | null {
  const match = /^#?([\p{L}\p{N}_-]+)$/u.exec(selector.trim())
  return match ? `[data-block-id="${match[1]}"]` : null
}

/** Readable ids and block ids listed in a "no match" error, at most this many of each. */
export const MAX_LISTED_IDS = 20

/**
 * In-page source of `(parts, fallback) => result`, where `parts` is a selector
 * split by {@link splitShadowSelector} and `fallback` is
 * {@link blockIdFallback}'s result (or null). It finds the first element
 * matching `parts`, else the first matching `fallback`, in the document and
 * in every open shadow root, and returns:
 *
 * - `{ element }`;
 * - `{ error: 'invalid', message }` when the selector does not parse (and the
 *   fallback finds nothing);
 * - `{ error: 'missing', ids, blockIds, fallback }`: the readable ids
 *   (`#name`) and the `data-block-id` values on the page, shadow roots
 *   included, for the error message.
 *
 * Plain JS with no outside references: it is sent to the page as text.
 */
export const FIND_SECTION_SOURCE = String.raw`(parts, fallback) => {
  // Every open shadow root under scope, depth first in tree order.
  const shadowRoots = (scope) => {
    const roots = []
    const visit = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          roots.push(el.shadowRoot)
          visit(el.shadowRoot)
        }
      }
    }
    visit(scope)
    return roots
  }
  // The first match in scope's own tree, else in the shadow roots under it.
  const first = (scope, selector) => {
    const own = scope.querySelector(selector)
    if (own) return own
    for (const root of shadowRoots(scope)) {
      const hit = root.querySelector(selector)
      if (hit) return hit
    }
    return null
  }
  const all = (scope, selector) =>
    [scope, ...shadowRoots(scope)].flatMap((root) => [...root.querySelectorAll(selector)])
  const query = () => {
    let scopes = [document]
    for (const part of parts.slice(0, -1)) {
      const hosts = new Set(scopes.flatMap((scope) => all(scope, part)))
      scopes = [...hosts].map((host) => host.shadowRoot || host)
    }
    for (const scope of scopes) {
      const hit = first(scope, parts[parts.length - 1])
      if (hit) return hit
    }
    return null
  }

  let element = null
  let invalid = null
  try {
    element = query()
  } catch (error) {
    invalid = String((error && error.message) || error)
  }
  if (!element && fallback) element = first(document, fallback)
  if (element) return { element }
  if (invalid) return { error: 'invalid', message: invalid }

  // A hint for the next try: readable ids (not SVG internals or generated
  // ids) and block ids, in the document and its shadow roots.
  const ids = new Set()
  const blockIds = new Set()
  for (const root of [document, ...shadowRoots(document)]) {
    for (const el of root.querySelectorAll(root === document ? 'body [id]' : '[id]')) {
      const id = el.id
      if (el.closest('svg') || !/^[A-Za-z][\w-]{0,39}$/.test(id) || /^w-node-|[0-9a-f]{8}/i.test(id)) continue
      ids.add('#' + id)
    }
    for (const el of root.querySelectorAll('[data-block-id]')) {
      const id = el.getAttribute('data-block-id')
      if (id) blockIds.add(id)
    }
  }
  return {
    error: 'missing',
    ids: [...ids].slice(0, ${MAX_LISTED_IDS}),
    blockIds: [...blockIds].slice(0, ${MAX_LISTED_IDS}),
    fallback,
  }
}`
