import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generateProject, registerFieldSchemas, type Block } from '@mechanica/shared'
import { toBlockMeta } from '../editor/block-meta'
import { readSiteData, readFoldersData } from '../vite/dev/data-store'
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
): Promise<ExportPage[]> {
  let entries: string[]
  try {
    entries = (await readdir(pagesDir, { recursive: true })) as string[]
  } catch {
    return []
  }

  const pages: ExportPage[] = []
  for (const relative of entries) {
    if (!relative.endsWith('.json')) continue
    const parsed = parse(relative)
    const dir = parsed.dir.replace(/\\/g, '/')
    const file = JSON.parse(await readFile(join(pagesDir, relative), 'utf-8'))
    const path =
      `/${dir}/${parsed.name === 'index' ? '' : parsed.name}`.replace('//', '/').replace(/\/$/, '') || '/'
    // Fold this page's folder-scoped data in; site data is applied via projectData.
    const data = { ...(dir ? foldersData[dir] : undefined), ...(file.data ?? {}) }
    pages.push({ path, content: file.content ?? [], data, page: { meta: file.meta } })
  }
  return pages
}

/** Build the project, then statically render every page into `export/`. */
export async function runExport(): Promise<void> {
  await runBuild()
  registerFieldSchemas()

  const cwd = process.cwd()
  const index = await readFile(join(cwd, 'dist/index.html'), 'utf-8')
  const ssr = await import(pathToFileURL(join(cwd, 'dist/ssr.js')).href)

  const blocks: Block[] = ssr.blocksList.map(toBlockMeta)
  const blocksMap = new Map(blocks.map((block) => [block.id, block]))

  const pages = await readPages(join(cwd, '.mech/pages'), readFoldersData(join(cwd, '.mech')))
  const projectData = readSiteData(join(cwd, '.mech'))
  const exportDir = join(cwd, 'export')
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(exportDir, { recursive: true })
  await cp(join(cwd, 'dist/assets'), join(exportDir, 'assets'), { recursive: true }).catch(() => {})

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
    console.info('Generated', path)
  }

  console.info(`Exported ${pages.length} page(s) → export/`)
}
