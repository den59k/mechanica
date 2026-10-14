import fs from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pageSlug, normalizePagePath, previewUrl, PREVIEW_READY } from './shot'
import { openPage, type BrowserPage } from './browser'
import { resolveServer } from './dev-server'

export interface ThumbsOptions {
  /** Output directory. Default: `.mech/thumbs/` (served at `/@mechanica/thumbs/`). */
  out?: string
  /** Dev server origin. Default: probe localhost:5173, else boot an ephemeral server. */
  server?: string
  /** Explicit Chromium-based browser executable path. */
  browser?: string
}

// Thumbnails capture the top of the page at desktop width, scaled down
// natively. The clip follows the page's real height (so short pages don't get
// a blank tail) up to a cap, and lands at 480px wide so the page browser's
// side preview (~320px, dialog-height) renders it crisp.
const CAPTURE_WIDTH = 1200
const VIEWPORT_HEIGHT = 900
const MAX_CAPTURE_HEIGHT = 2000
const THUMB_WIDTH = 480

/** Keep only pages under `prefix` (a normalized page path), or all when omitted. */
export function filterByPrefix<T extends { path: string }>(pages: T[], prefix?: string): T[] {
  if (!prefix || prefix === '/') return pages
  return pages.filter((page) => page.path === prefix || page.path.startsWith(prefix + '/'))
}

/** Palette-visible blocks, optionally narrowed to an id (or id prefix). */
export function filterBlockTargets<T extends { id: string; hidden?: boolean }>(blocks: T[], filter?: string): T[] {
  const visible = blocks.filter((block) => !block.hidden)
  if (!filter) return visible
  return visible.filter((block) => block.id === filter || block.id.startsWith(filter))
}

/** Thumbnail files that no longer correspond to any page (candidates for deletion). */
export function orphanThumbs(files: string[], slugs: Set<string>): string[] {
  return files.filter((file) => file.endsWith('.png') && !slugs.has(file.slice(0, -4)))
}

/**
 * `mechanica thumbs [/path-prefix]` — walk the project's pages and write a
 * screenshot of each (top of the page at 1200px wide, scaled to 480px) into
 * `.mech/thumbs/`, where the dev server serves them to the editor's page
 * browser. One warm browser tab renders all pages sequentially; a page that
 * fails is reported and skipped, and thumbnails of deleted pages are removed.
 */
export async function runThumbs(prefix: string | undefined, options: ThumbsOptions = {}): Promise<void> {
  const normalizedPrefix = prefix ? normalizePagePath(prefix) : undefined

  const server = await resolveServer(options.server)
  let tab: BrowserPage | undefined
  try {
    const listed = await fetch(`${server.origin}/@mechanica/pages`)
    if (!listed.ok) throw new Error(`Could not list pages (${listed.status}) — is this a Mechanica project?`)
    const pages = (await listed.json()) as Array<{ path: string }>
    const targets = filterByPrefix(pages, normalizedPrefix)
    if (!targets.length) {
      const known = pages.map((page) => page.path).sort().join(', ')
      throw new Error(`No pages under "${normalizedPrefix}". Available pages: ${known}`)
    }

    const outDir = options.out ?? join('.mech', 'thumbs')
    await mkdir(outDir, { recursive: true })

    tab = await openPage(undefined, { width: CAPTURE_WIDTH, height: VIEWPORT_HEIGHT, browser: options.browser })

    const failures: string[] = []
    for (const page of targets) {
      try {
        await tab.goto(`${server.origin}${page.path}?mechanica-shot=1`)
        await tab.freezeAnimations()

        const metrics = await tab.send('Page.getLayoutMetrics')
        const contentSize = metrics.cssContentSize ?? metrics.contentSize
        const height = Math.min(Math.ceil(contentSize.height), MAX_CAPTURE_HEIGHT)
        const png = await tab.screenshot({
          clip: { x: 0, y: 0, width: CAPTURE_WIDTH, height },
          scale: THUMB_WIDTH / CAPTURE_WIDTH,
        })
        const out = join(outDir, `${pageSlug(page.path)}.png`)
        fs.writeFileSync(out, png)
        console.info(`✓ ${page.path} → ${out}`)
      } catch (error) {
        failures.push(page.path)
        console.error(`✗ ${page.path}: ${error instanceof Error ? error.message : error}`)
      }
    }

    // A full run knows every page — drop thumbnails of pages that no longer exist.
    if (!normalizedPrefix) {
      const slugs = new Set(pages.map((page) => pageSlug(page.path)))
      for (const file of orphanThumbs(fs.readdirSync(outDir), slugs)) {
        fs.rmSync(join(outDir, file))
        console.info(`− removed stale ${join(outDir, file)}`)
      }
    }

    if (failures.length) {
      throw new Error(`Failed to render ${failures.length} page(s): ${failures.join(', ')}`)
    }
  } finally {
    await tab?.close()
    await server.close()
  }
}

/** Block thumbnails render standalone at page width, scaled down like the hover preview. */
const BLOCK_CAPTURE_WIDTH = 1200
const BLOCK_MIN_HEIGHT = 120
const BLOCK_MAX_HEIGHT = 900
const BLOCK_THUMB_WIDTH = 240

/**
 * `mechanica thumbs --blocks [id]` — screenshot every palette-visible block
 * through the standalone preview route (so `previewData`/defaults resolve) into
 * `.mech/thumbs/blocks/<blockId>.png`, where the dev server serves them as the
 * palette's card thumbnails. Same contract as page thumbs: one warm tab, a
 * failing block is reported and skipped, stale thumbnails are removed.
 */
export async function runBlockThumbs(filter: string | undefined, options: ThumbsOptions = {}): Promise<void> {
  const server = await resolveServer(options.server)
  let tab: BrowserPage | undefined
  try {
    const listed = await fetch(`${server.origin}/@mechanica/blocks`)
    if (!listed.ok) throw new Error(`Could not list blocks (${listed.status}) — is this a Mechanica project?`)
    const blocks = (await listed.json()) as Array<{ id: string; hidden?: boolean }>
    const targets = filterBlockTargets(blocks, filter)
    if (!targets.length) {
      const known = blocks.filter((block) => !block.hidden).map((block) => block.id).sort().join(', ')
      throw new Error(`No blocks match "${filter}". Available blocks: ${known}`)
    }

    const outDir = options.out ?? join('.mech', 'thumbs', 'blocks')
    await mkdir(outDir, { recursive: true })

    tab = await openPage(undefined, {
      width: BLOCK_CAPTURE_WIDTH,
      height: BLOCK_MAX_HEIGHT,
      browser: options.browser,
    })

    const failures: string[] = []
    for (const block of targets) {
      try {
        await tab.goto(previewUrl(server.origin, block.id), { ready: PREVIEW_READY, settle: false })
        const previewError = await tab.evaluate<string | null>('window.__MECHANICA_PREVIEW_ERROR__ ?? null')
        if (previewError) throw new Error(previewError)
        await tab.settle()
        await tab.freezeAnimations()

        // Clip to the block's own height (capped) so short blocks aren't mostly
        // white and tall ones show their top — matching the hover preview.
        const measured = await tab.evaluate<number>(
          `document.querySelector('[data-block-id]')?.getBoundingClientRect().height ?? 0`,
        )
        const height = Math.min(BLOCK_MAX_HEIGHT, Math.max(BLOCK_MIN_HEIGHT, Math.ceil(measured)))

        const png = await tab.screenshot({
          clip: { x: 0, y: 0, width: BLOCK_CAPTURE_WIDTH, height },
          scale: BLOCK_THUMB_WIDTH / BLOCK_CAPTURE_WIDTH,
        })
        const out = join(outDir, `${block.id}.png`)
        fs.writeFileSync(out, png)
        console.info(`✓ ${block.id} → ${out}`)
      } catch (error) {
        failures.push(block.id)
        console.error(`✗ ${block.id}: ${error instanceof Error ? error.message : error}`)
      }
    }

    // A full run knows every block — drop thumbnails of blocks that no longer exist.
    if (!filter) {
      const ids = new Set(blocks.map((block) => block.id))
      for (const file of orphanThumbs(fs.readdirSync(outDir), ids)) {
        fs.rmSync(join(outDir, file))
        console.info(`− removed stale ${join(outDir, file)}`)
      }
    }

    if (failures.length) {
      throw new Error(`Failed to render ${failures.length} block(s): ${failures.join(', ')}`)
    }
  } finally {
    await tab?.close()
    await server.close()
  }
}
