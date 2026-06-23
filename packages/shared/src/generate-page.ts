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

/** Substitute `{{ a.b }}` placeholders in an HTML string with data values. */
export function passDataToHTML(html: string, data: any): string {
  return html.replace(/\{\{(.+?)\}\}/g, (_match, expr) => String(getValueByPath(data, expr.trim()) ?? ''))
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

  let index = passDataToHTML(options.index, data)

  // Inject the rendered markup into the #app container.
  const appMatch = index.match(/(<div[^>]*\bid="app"[^>]*>)([\s\S]*?)<\/div>/)
  if (appMatch) {
    const start = appMatch.index! + appMatch[1]!.length
    const end = appMatch.index! + appMatch[0].length - '</div>'.length
    index = index.slice(0, start) + rendered + index.slice(end)
  }

  if (options.assetsUrl) index = index.replace(/\/assets\//g, options.assetsUrl)

  const stateScript = `<script>window.state=${JSON.stringify(state)}</script>`
  return index.replace('</body>', `${stateScript}\n</body>`)
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
