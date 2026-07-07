import type { Block } from './types'
import type { LocalesConfig } from './locale'
import { passDefaultValue, walkTree, walkSchema, getValueByPath } from './schema'

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Escape a templated value so it's safe in element text and attribute values. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]!)
}

/**
 * Substitute `{{ a.b }}` placeholders in an HTML string with data values. Used to
 * template the `<head>` (title, meta, Open Graph, …) from `defineData` values and
 * the current page. Resolved values are HTML-escaped. The triple-brace form
 * `{{{ a.b }}}` serializes the value as raw JSON instead (script-safe, see
 * {@link serializeState}) — for JSON-LD structured data inside a
 * `<script type="application/ld+json">`, where HTML-escaping would corrupt it.
 */
export function passDataToHTML(html: string, data: any): string {
  return html.replace(/\{\{\{(.+?)\}\}\}|\{\{(.+?)\}\}/g, (_match, rawExpr, escapedExpr) => {
    if (rawExpr !== undefined) {
      const value = getValueByPath(data, rawExpr.trim())
      return value === undefined ? '' : serializeState(value)
    }
    return escapeHtml(String(getValueByPath(data, escapedExpr.trim()) ?? ''))
  })
}

export interface PageState {
  content: any[]
  data: Record<string, any>
  page?: {
    title?: string
    path?: string
    meta?: Record<string, unknown>
    /** Set on paginated variants: which chunk of the page's paginated query this is. */
    pagination?: { page: number; pageCount?: number }
    /** The locale this page renders in (multi-language sites). */
    locale?: string
    /** Which locales this logical page has a translation for. */
    locales?: string[]
  }
}

/** What `render` may return: bare HTML, or HTML plus the queries it resolved. */
export type RenderResult = string | { html: string; query?: Record<string, unknown> }

export interface GeneratePageOptions {
  /** The index.html template. */
  index: string
  /** Block metadata keyed by blockId. */
  blocksMap: Map<string, Block>
  /** The page to render. */
  state: PageState
  /** Declared data entries (with unfolded schemas) for default-filling. */
  dataEntries: { id: string; props: any }[]
  /** Site-level data merged under page data. */
  projectData?: Record<string, any>
  /** Site identity, exposed to `{{ site.url }}` / `{{ site.name }}` templating. */
  site?: { url?: string; name?: string }
  /** The site's locale config — baked into `state.locales` so the runtime can
   *  prefix internal links for the page's locale. Omitted when i18n is off. */
  locales?: LocalesConfig
  baseUrl?: string
  path?: string
  /**
   * Serve build assets from this base URL (a CDN origin like
   * `https://cdn.example.com`). Root-relative `/assets/…` references in the
   * HTML are prefixed with it — `/assets/x.js` → `<assetsUrl>/assets/x.js` — so
   * the built `assets/` folder can live on a CDN. A trailing slash is ignored,
   * and an already-absolute `https://…/assets/` URL is left untouched. Uploaded
   * media (`/media/…`) is rewritten by the export's `onFile`, not here.
   */
  assetsUrl?: string
  /**
   * Extra `<link>` tags for this page's content, injected before `</head>` —
   * used by the export to preload the block chunks/CSS the page uses (blocks
   * are code-split out of the client entry).
   */
  pageLinks?: (content: any[]) => string[]
  /**
   * Render the page state to HTML (provided by the SSR bundle). May also
   * return the query results resolved during the render — they're baked into
   * `window.state.query` so the client hydrates them synchronously.
   */
  render: (state: any, path: string) => Promise<RenderResult> | RenderResult
}

/** Render a single page into the index template with serialized state. */
export async function generatePage(
  options: GeneratePageOptions,
): Promise<{ html: string; query: Record<string, unknown> }> {
  // Fill block-data defaults from each block's schema.
  walkTree(options.state.content, (block: any) => {
    const meta = options.blocksMap.get(block.blockId)
    if (meta) passDefaultValue(block.data, meta.props)
  })

  // Merge and default the shared data entries.
  const merged = { ...options.projectData, ...options.state.data }
  const data = Object.fromEntries(
    options.dataEntries.map((entry) => [entry.id, passDefaultValue(merged[entry.id] ?? {}, entry.props)]),
  )

  const state: Record<string, unknown> = {
    content: options.state.content,
    data,
    baseUrl: options.baseUrl,
    // The page's own path rides along (pagination pathFor, `{{ page.path }}`).
    page: { path: options.path, ...options.state.page },
  }
  // The locale config rides the state so the runtime prefixes internal links
  // for `page.locale` and language switchers can enumerate translations.
  if (options.locales) state.locales = options.locales

  const result = await options.render(state, options.path ?? '')
  const rendered = typeof result === 'string' ? result : result.html
  const query = (typeof result === 'string' ? undefined : result.query) ?? {}
  // Bake resolved queries into the hydration state — the client reads them
  // synchronously, so hydration matches the server markup with no refetch.
  if (Object.keys(query).length) state.query = query

  // Template against data plus the page identity and site config, so
  // `{{ page.meta.title }}`, `{{ page.path }}` and `{{ site.url }}` all work.
  // Uses `state.page` (not `options.state.page`) so `path` is present — the
  // same shape dev's transformIndexHtml templates against.
  let index = passDataToHTML(options.index, { ...data, site: options.site, page: state.page })

  // Inject the rendered markup into the #app container. A template without it
  // would export empty pages — fail loudly instead of silently shipping shells.
  const appMatch = index.match(/(<div[^>]*\bid="app"[^>]*>)([\s\S]*?)<\/div>/)
  if (!appMatch) {
    throw new Error(
      'index.html has no <div id="app"> container — the rendered page has nowhere to go. ' +
        'Add <div id="app"></div> to the template body.',
    )
  }
  const start = appMatch.index! + appMatch[1]!.length
  const end = appMatch.index! + appMatch[0].length - '</div>'.length
  index = index.slice(0, start) + rendered + index.slice(end)

  const links = options.pageLinks?.(options.state.content) ?? []
  if (links.length) index = index.replace('</head>', `${links.join('\n')}\n</head>`)

  if (options.assetsUrl) {
    const base = options.assetsUrl.replace(/\/+$/, '')
    // Prefix only genuine root-relative refs (right after a quote/paren/equals),
    // so an already-absolute `https://…/assets/` URL is never double-prefixed.
    index = index.replace(/(["'(=])\/assets\//g, (_, edge) => `${edge}${base}/assets/`)
  }

  const stateScript = `<script>window.state=${serializeState(state)}</script>`
  return { html: index.replace('</body>', `${stateScript}\n</body>`), query }
}

// Characters that can break out of an inline <script>: `<` (closes the tag via
// `</script>`, or opens `<script`/`<!--`) and the line separators U+2028 / U+2029
// (invalid in JS string literals). Built from char codes so the source stays
// plain ASCII.
const UNSAFE_IN_SCRIPT = new RegExp(`[${[0x3c, 0x2028, 0x2029].map((c) => '\\u' + c.toString(16).padStart(4, '0')).join('')}]`, 'g')

/**
 * Serialize runtime state for embedding in an inline `<script>`. Plain JSON is
 * unsafe (a `</script>` in the data would close the tag early), so the few
 * dangerous characters are escaped to their `\uXXXX` form — valid JSON/JS that
 * `window.state` and the router's regex read back unchanged.
 */
export function serializeState(state: unknown): string {
  return JSON.stringify(state).replace(UNSAFE_IN_SCRIPT, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
}

export interface GenerateProjectOptions extends Omit<GeneratePageOptions, 'state' | 'path'> {
  pages: Array<{ content: any[]; data: Record<string, any>; path: string; page?: PageState['page'] }>
  /** Map an asset path to its emitted path (and copy it). */
  onFile?: (path: string) => string
}

/** Render every page of a project, yielding the html, path and resolved queries. */
export async function* generateProject(
  options: GenerateProjectOptions,
): AsyncGenerator<{ html: string; path: string; query: Record<string, unknown> }> {
  for (const page of options.pages) {
    page.content = page.content ?? []
    if (options.onFile) collectFiles(page.content, options.blocksMap, options.onFile)
    const { html, query } = await generatePage({ ...options, state: page, path: page.path })
    yield { html, path: page.path, query }
  }
}

/** Rewrite asset references (image/file/richText) through `onFile`. */
function collectFiles(content: any[], blocksMap: Map<string, Block>, onFile: (path: string) => string): void {
  walkTree(content, (block) => {
    const meta = blocksMap.get(block.blockId)
    if (!meta) return
    walkSchema(block.data, meta.props, (value: any, schema: any) => {
      if (!value) return
      if (schema.format === 'image' || schema.format === 'file') {
        if (value.src) value.src = onFile(value.src)
        if (value.previewSrc) value.previewSrc = onFile(value.previewSrc)
        if (value.croppedSrc) value.croppedSrc = onFile(value.croppedSrc)
      }
      if (schema.format === 'richText' && schema.type === 'array') {
        for (const row of value) {
          if (row.image?.src) row.image.src = onFile(row.image.src)
          if (row.image?.previewSrc) row.image.previewSrc = onFile(row.image.previewSrc)
          if (row.image?.croppedSrc) row.image.croppedSrc = onFile(row.image.croppedSrc)
        }
      }
    })
  })
}
