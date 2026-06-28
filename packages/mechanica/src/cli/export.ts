import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  generateProject,
  parsePage,
  registerFieldSchemas,
  type Block,
  type RichTextCodec,
} from '@mechanica/shared'
import { toBlockMeta, type BlockComponent } from '../editor/lib/block-meta'
import { readSiteData, readFoldersData } from '../vite/dev/data-store'
import { buildRichTextCodec } from '../vite/rich-text-codec'
import { runBuild } from './build'

interface ExportPage {
  path: string
  content: any[]
  data: Record<string, any>
  page?: { title?: string; meta?: Record<string, unknown> }
}

/** Read every page JSON under `<mech>/pages` as an exportable page. */
async function readPages(
  pagesDir: string,
  foldersData: Record<string, Record<string, any>> = {},
  richText?: RichTextCodec,
): Promise<ExportPage[]> {
  let entries: string[]
  try {
    entries = (await readdir(pagesDir, { recursive: true })) as string[]
  } catch {
    return []
  }

  const EXT = '.page.md'
  const pages: ExportPage[] = []
  for (const relative of entries) {
    if (!relative.endsWith(EXT)) continue
    const parsed = parse(relative)
    const dir = parsed.dir.replace(/\\/g, '/')
    const base = parsed.base.slice(0, -EXT.length)
    const file = parsePage(await readFile(join(pagesDir, relative), 'utf-8'), richText ? { richText } : undefined)
    const path = `/${dir}/${base === 'index' ? '' : base}`.replace('//', '/').replace(/\/$/, '') || '/'
    // Fold this page's folder-scoped data in; site data is applied via projectData.
    const data = { ...(dir ? foldersData[dir] : undefined), ...(file.data ?? {}) }
    pages.push({ path, content: file.content ?? [], data, page: { meta: file.meta } })
  }
  return pages
}

/** An already-built SSR bundle (`dist/ssr.js`) exposes these. */
export interface SsrBundle {
  render: (state: any, path?: string) => Promise<string> | string
  blocksList: BlockComponent[]
  dataEntries?: { id: string; props: any }[]
}

/**
 * Statically render every page of an already-built project into `export/`,
 * returning the generated page paths. This is the post-build core of
 * {@link runExport}, isolated so it can be tested without a Vite build: it
 * expects `<cwd>/dist` (index.html, assets, the loaded `ssr` bundle) and that
 * field schemas have been registered; it reads pages + scoped data from
 * `<cwd>/.mech`.
 */
export async function exportProject(cwd: string, ssr: SsrBundle): Promise<string[]> {
  const index = await readFile(join(cwd, 'dist/index.html'), 'utf-8')

  const blocks: Block[] = ssr.blocksList.map(toBlockMeta)
  const blocksMap = new Map(blocks.map((block) => [block.id, block]))

  const richText = buildRichTextCodec(ssr.blocksList)
  const pages = await readPages(join(cwd, '.mech/pages'), readFoldersData(join(cwd, '.mech')), richText)
  const projectData = readSiteData(join(cwd, '.mech'))

  const exportDir = join(cwd, 'export')
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(exportDir, { recursive: true })
  await cp(join(cwd, 'dist/assets'), join(exportDir, 'assets'), { recursive: true }).catch(() => {})

  const written: string[] = []
  const iterator = generateProject({
    index,
    blocksMap,
    dataEntries: ssr.dataEntries ?? [],
    projectData,
    pages,
    render: (state: any) => ssr.render(state),
    onFile: (src: string) => src,
  })

  for await (const [html, path] of iterator) {
    const dir = path === '/' ? exportDir : join(exportDir, path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), html)
    written.push(path)
  }
  return written
}

/** Build the project, then statically render every page into `export/`. */
export async function runExport(): Promise<void> {
  await runBuild()
  registerFieldSchemas()

  const cwd = process.cwd()
  const ssr = (await import(pathToFileURL(join(cwd, 'dist/ssr.js')).href)) as SsrBundle
  const written = await exportProject(cwd, ssr)

  for (const path of written) console.info('Generated', path)
  console.info(`Exported ${written.length} page(s) → export/`)
}
