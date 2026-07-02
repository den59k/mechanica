import fs from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pageSlug, normalizePagePath, previewUrl } from './shot'
import {
  launchBrowser,
  resolveServer,
  setViewport,
  evaluateValue,
  waitForCondition,
  settlePageMedia,
  freezeAnimations,
  type LaunchedBrowser,
} from './headless'

export interface ThumbsOptions {
  /** Output directory. Default: `.mech/thumbs/` (served at `/@mechanica/thumbs/`). */
  out?: string
  /** Dev server origin. Default: probe localhost:5173, else boot an ephemeral server. */
  server?: string
  /** Explicit Chromium-based browser executable path. */
  browser?: string
}

/** Thumbnails capture the top of the page at desktop width, scaled down natively. */
const CAPTURE_WIDTH = 1200
const CAPTURE_HEIGHT = 900
const THUMB_WIDTH = 320

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
 * small screenshot of each (top 1200×900, scaled to 320px wide) into
 * `.mech/thumbs/`, where the dev server serves them to the editor's page
 * browser. One warm browser tab renders all pages sequentially; a page that
 * fails is reported and skipped, and thumbnails of deleted pages are removed.
 */
export async function runThumbs(prefix: string | undefined, options: ThumbsOptions = {}): Promise<void> {
  const normalizedPrefix = prefix ? normalizePagePath(prefix) : undefined

  const server = await resolveServer(options.server)
  let browser: LaunchedBrowser | undefined
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

    browser = await launchBrowser(options.browser)
    const cdp = browser.client
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await setViewport(cdp, sessionId, CAPTURE_WIDTH, CAPTURE_HEIGHT)
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      sessionId,
    )

    const failures: string[] = []
    for (const page of targets) {
      try {
        const navigation = await cdp.send(
          'Page.navigate',
          { url: `${server.origin}${page.path}?mechanica-shot=1` },
          sessionId,
        )
        if (navigation.errorText) throw new Error(navigation.errorText)
        await waitForCondition(cdp, sessionId, "document.readyState === 'complete'", 15_000)
        await settlePageMedia(cdp, sessionId)
        await freezeAnimations(cdp, sessionId)

        const shot = await cdp.send(
          'Page.captureScreenshot',
          {
            format: 'png',
            clip: { x: 0, y: 0, width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, scale: THUMB_WIDTH / CAPTURE_WIDTH },
          },
          sessionId,
        )
        const out = join(outDir, `${pageSlug(page.path)}.png`)
        fs.writeFileSync(out, Buffer.from(shot.data as string, 'base64'))
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
    await browser?.close()
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
  let browser: LaunchedBrowser | undefined
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

    browser = await launchBrowser(options.browser)
    const cdp = browser.client
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await setViewport(cdp, sessionId, BLOCK_CAPTURE_WIDTH, BLOCK_MAX_HEIGHT)
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      sessionId,
    )

    const failures: string[] = []
    for (const block of targets) {
      try {
        const navigation = await cdp.send(
          'Page.navigate',
          { url: previewUrl(server.origin, block.id) },
          sessionId,
        )
        if (navigation.errorText) throw new Error(navigation.errorText)
        await waitForCondition(cdp, sessionId, 'window.__MECHANICA_PREVIEW_READY__ === true', 15_000)
        const previewError = await evaluateValue<string | null>(
          cdp,
          sessionId,
          'window.__MECHANICA_PREVIEW_ERROR__ ?? null',
        )
        if (previewError) throw new Error(previewError)
        await settlePageMedia(cdp, sessionId)
        await freezeAnimations(cdp, sessionId)

        // Clip to the block's own height (capped) so short blocks aren't mostly
        // white and tall ones show their top — matching the hover preview.
        const measured = await evaluateValue<number>(
          cdp,
          sessionId,
          `document.querySelector('[data-block-id]')?.getBoundingClientRect().height ?? 0`,
        )
        const height = Math.min(BLOCK_MAX_HEIGHT, Math.max(BLOCK_MIN_HEIGHT, Math.ceil(measured)))

        const shot = await cdp.send(
          'Page.captureScreenshot',
          {
            format: 'png',
            captureBeyondViewport: true,
            clip: {
              x: 0,
              y: 0,
              width: BLOCK_CAPTURE_WIDTH,
              height,
              scale: BLOCK_THUMB_WIDTH / BLOCK_CAPTURE_WIDTH,
            },
          },
          sessionId,
        )
        const out = join(outDir, `${block.id}.png`)
        fs.writeFileSync(out, Buffer.from(shot.data as string, 'base64'))
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
    await browser?.close()
    await server.close()
  }
}
