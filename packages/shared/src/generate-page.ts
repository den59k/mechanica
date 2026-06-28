import type { Block } from './types'
import { passDefaultValue, walkTree, walkSchema } from './schema'

/** Resolve a dotted path within a data object. */
export function getValueByPath(data: any, path: string): unknown {
  let value = data
  for (const key of path.split('.')) {
    if (value == null) return value
    value = value[key]
  }
  return value
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Escape a templated value so it's safe in element text and attribute values. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]!)
}

/**
 * Substitute `{{ a.b }}` placeholders in an HTML string with data values. Used to
 * template the `<head>` (title, meta, Open Graph, …) from `defineData` values and
 * the current page. Resolved values are HTML-escaped.
 */
export function passDataToHTML(html: string, data: any): string {
  return html.replace(/\{\{(.+?)\}\}/g, (_match, expr) =>
    escapeHtml(String(getValueByPath(data, expr.trim()) ?? '')),
  )
}

export interface PageState {
  content: any[]
  data: Record<string, any>
  page?: { title?: string; path?: string; meta?: Record<string, unknown> }
}

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
  baseUrl?: string
  path?: string
  /** Rewrite `/assets/` to this base when set. */
  assetsUrl?: string
  /** Render the page state to HTML (provided by the SSR bundle). */
  render: (state: any, path: string) => Promise<string> | string
}

/** Render a single page into the index template with serialized state. */
export async function generatePage(options: GeneratePageOptions): Promise<string> {
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

  const state = {
    content: options.state.content,
    data,
    baseUrl: options.baseUrl,
    page: options.state.page,
  }

  const rendered = await options.render(state, options.path ?? '')

  // Template against data plus the page meta, so `{{ page.meta.title }}` works.
  let index = passDataToHTML(options.index, { ...data, page: options.state.page })

  // Inject the rendered markup into the #app container.
  const appMatch = index.match(/(<div[^>]*\bid="app"[^>]*>)([\s\S]*?)<\/div>/)
  if (appMatch) {
    const start = appMatch.index! + appMatch[1]!.length
    const end = appMatch.index! + appMatch[0].length - '</div>'.length
    index = index.slice(0, start) + rendered + index.slice(end)
  }

  if (options.assetsUrl) index = index.replace(/\/assets\//g, options.assetsUrl)

  const stateScript = `<script>window.state=${serializeState(state)}</script>`
  return index.replace('</body>', `${stateScript}\n</body>`)
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

/** Render every page of a project, yielding `[html, path]` pairs. */
export async function* generateProject(
  options: GenerateProjectOptions,
): AsyncGenerator<[string, string]> {
  for (const page of options.pages) {
    page.content = page.content ?? []
    if (options.onFile) collectFiles(page.content, options.blocksMap, options.onFile)
    const html = await generatePage({ ...options, state: page, path: page.path })
    yield [html, page.path]
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
      }
      if (schema.format === 'richText' && schema.type === 'array') {
        for (const row of value) {
          if (row.image?.src) row.image.src = onFile(row.image.src)
          if (row.image?.previewSrc) row.image.previewSrc = onFile(row.image.previewSrc)
        }
      }
    })
  })
}
