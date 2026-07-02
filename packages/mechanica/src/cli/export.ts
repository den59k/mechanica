import { readFile, writeFile, mkdir, rm, cp, readdir, copyFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  findUnknownBlocks,
  generateProject,
  migrateContent,
  parsePage,
  registerFieldSchemas,
  validateLinks,
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

export interface ExportOptions {
  /** Absolute site origin (e.g. `https://example.com`) — enables sitemap.xml. */
  siteUrl?: string
  /** Warning sink (broken links, orphaned assets). Defaults to `console.warn`. */
  onWarn?: (message: string) => void
}

/** The dev-server URL prefix uploaded assets are referenced by in page data. */
const UPLOADS_PREFIX = '/@mechanica/assets/'
/** Where uploaded assets land in the static export. */
const MEDIA_DIR = 'media'

/**
 * Statically render every page of an already-built project into `export/`,
 * returning the generated page paths. This is the post-build core of
 * {@link runExport}, isolated so it can be tested without a Vite build: it
 * expects `<cwd>/dist` (index.html, assets, the loaded `ssr` bundle) and that
 * field schemas have been registered; it reads pages + scoped data from
 * `<cwd>/.mech`.
 *
 * Beyond the pages it also: rewrites + copies uploaded assets
 * (`/@mechanica/assets/…` → `/media/…`), warns about dead internal links and
 * orphaned uploads, emits `404.html` when a `/404` page exists, and emits
 * `sitemap.xml` when `siteUrl` is given.
 */
export async function exportProject(
  cwd: string,
  ssr: SsrBundle,
  options: ExportOptions = {},
): Promise<string[]> {
  const warn = options.onWarn ?? ((message: string) => console.warn(message))
  const index = await readFile(join(cwd, 'dist/index.html'), 'utf-8')

  const blocks: Block[] = ssr.blocksList.map(toBlockMeta)
  const blocksMap = new Map(blocks.map((block) => [block.id, block]))

  const richText = buildRichTextCodec(ssr.blocksList)
  const pages = await readPages(join(cwd, '.mech/pages'), readFoldersData(join(cwd, '.mech')), richText)
  const projectData = readSiteData(join(cwd, '.mech'))

  // Upgrade data written with older block schemas, and surface blocks that no
  // longer exist (they render as nothing — usually a renamed/deleted block).
  for (const page of pages) {
    migrateContent(page.content, blocksMap)
    for (const id of findUnknownBlocks(page.content, blocksMap)) {
      warn(`[mechanica] Page ${page.path} references unknown block "${id}" — it renders as nothing`)
    }
  }

  // Dead internal links: warn (not fail) — a target may be served elsewhere.
  for (const issue of validateLinks(pages, blocksMap)) {
    warn(`[mechanica] Broken link on ${issue.page}: ${issue.url} has no matching page`)
  }

  const exportDir = join(cwd, 'export')
  await rm(exportDir, { recursive: true, force: true })
  await mkdir(exportDir, { recursive: true })
  await cp(join(cwd, 'dist/assets'), join(exportDir, 'assets'), { recursive: true }).catch(() => {})

  // Uploaded assets (`.mech/assets`): rewrite their dev URLs to `/media/…` and
  // remember which files pages actually reference, so we copy exactly those.
  const referenced = new Set<string>()
  const onFile = (src: string): string => {
    if (typeof src !== 'string' || !src.startsWith(UPLOADS_PREFIX)) return src
    const relative = decodeURIComponent(src.slice(UPLOADS_PREFIX.length))
    referenced.add(relative)
    return `/${MEDIA_DIR}/${relative}`
  }

  const written: string[] = []
  const iterator = generateProject({
    index,
    blocksMap,
    dataEntries: ssr.dataEntries ?? [],
    projectData,
    pages,
    render: (state: any) => ssr.render(state),
    onFile,
  })

  for await (const [html, path] of iterator) {
    const dir = path === '/' ? exportDir : join(exportDir, path)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), html)
    written.push(path)
  }

  await copyUploads(join(cwd, '.mech/assets'), join(exportDir, MEDIA_DIR), referenced, warn)

  // Static-host 404 convention: a `/404` page also lands at export/404.html.
  if (written.includes('/404')) {
    await copyFile(join(exportDir, '404/index.html'), join(exportDir, '404.html'))
  }

  if (options.siteUrl) {
    await writeFile(join(exportDir, 'sitemap.xml'), buildSitemap(options.siteUrl, written))
  }

  return written
}

/** Copy referenced uploads into the export; warn about missing + orphaned files. */
async function copyUploads(
  assetsDir: string,
  outDir: string,
  referenced: Set<string>,
  warn: (message: string) => void,
): Promise<void> {
  for (const relative of referenced) {
    const target = join(outDir, relative)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(assetsDir, relative), target).catch(() => {
      warn(`[mechanica] Missing upload: ${relative} is referenced by a page but not in .mech/assets`)
    })
  }

  // Orphans: uploads no page references. Report only — deleting is the user's call.
  const existing = (await readdir(assetsDir, { recursive: true }).catch(() => [])) as string[]
  const orphans = existing
    .map((entry) => entry.replace(/\\/g, '/'))
    .filter((entry) => /\.\w+$/.test(entry) && !referenced.has(entry))
  if (orphans.length) {
    warn(
      `[mechanica] ${orphans.length} unused upload(s) in .mech/assets (not exported): ${orphans.join(', ')}`,
    )
  }
}

/** Build a minimal sitemap.xml for the exported pages (directory-style URLs). */
function buildSitemap(siteUrl: string, paths: string[]): string {
  const base = siteUrl.replace(/\/+$/, '')
  const urls = paths
    .filter((path) => path !== '/404')
    .sort()
    .map((path) => `  <url><loc>${base}${path === '/' ? '/' : `${path}/`}</loc></url>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/** Build the project, then statically render every page into `export/`. */
export async function runExport(options: ExportOptions = {}): Promise<void> {
  await runBuild()
  registerFieldSchemas()

  const cwd = process.cwd()
  const ssr = (await import(pathToFileURL(join(cwd, 'dist/ssr.js')).href)) as SsrBundle
  const written = await exportProject(cwd, ssr, options)

  for (const path of written) console.info('Generated', path)
  console.info(`Exported ${written.length} page(s) → export/`)
}
