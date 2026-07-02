import fs from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  launchBrowser,
  resolveServer,
  setViewport,
  evaluateValue,
  waitForCondition,
  settlePageMedia,
  freezeAnimations,
  fullPageClip,
  type LaunchedBrowser,
} from './headless'

export interface ShotOptions {
  /** Shoot a whole page by URL path instead of a block (`--page /docs`). */
  page?: string
  /** Prop overrides: inline JSON, or `@path/to/file.json` (block shots only). */
  data?: string
  /** Viewport width(s), comma-separated (e.g. `1440,768,390`). */
  width?: string
  /** Output PNG path (single width) or directory. Default: `.mech/shots/`. */
  out?: string
  /** Dev server origin. Default: probe localhost:5173, else boot an ephemeral server. */
  server?: string
  /** Explicit Chromium-based browser executable path. */
  browser?: string
  /** Screenshot the full page instead of clipping to the block element. */
  full?: boolean
}

/** Parse a `--width` value into a list of positive integers. Defaults to `[1440]`. */
export function parseWidths(value: string | undefined): number[] {
  if (!value) return [1440]
  const widths = value.split(',').map((part) => Number.parseInt(part.trim(), 10))
  if (widths.length === 0 || widths.some((w) => !Number.isFinite(w) || w <= 0)) {
    throw new Error(`Invalid --width value "${value}" — expected e.g. 1440 or 1440,768,390`)
  }
  return widths
}

/** Resolve `--data`: inline JSON or `@file`, validated to a JSON object. */
export function resolveDataArg(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined
  // Strip a UTF-8 BOM — PowerShell's default utf8 encoding writes one.
  const raw = (value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf-8') : value).replace(/^﻿/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`--data is not valid JSON: ${error instanceof Error ? error.message : error}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--data must be a JSON object of prop overrides')
  }
  return parsed as Record<string, unknown>
}

/** Build the preview-route URL for a block on a given server origin. */
export function previewUrl(origin: string, blockId: string, data?: Record<string, unknown>): string {
  const base = origin.replace(/\/+$/, '')
  const query = data ? `?data=${encodeURIComponent(JSON.stringify(data))}` : ''
  return `${base}/@mechanica/preview/${encodeURIComponent(blockId)}${query}`
}

/** Resolve the output PNG path for one width. */
export function outputPath(out: string | undefined, name: string, width: number, multi: boolean): string {
  const suffix = multi ? `-w${width}` : ''
  if (!out) return join('.mech', 'shots', `${name}${suffix}.png`)
  if (out.endsWith('.png')) return multi ? out.replace(/\.png$/, `${suffix}.png`) : out
  return join(out, `${name}${suffix}.png`)
}

/** `/` → `index`, `/docs/getting-started` → `docs-getting-started`. */
export function pageSlug(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  return trimmed ? trimmed.replace(/\//g, '-') : 'index'
}

/** Normalize a page path: leading slash, no trailing slash (except the root). */
export function normalizePagePath(path: string): string {
  const cleaned = '/' + path.trim().replace(/^\/+|\/+$/g, '')
  return cleaned
}

const USAGE =
  'Usage: mechanica shot <blockId | /page/path> [--page </path>] [--data <json|@file>] [--width 1440,768] [--out <path>] [--server <url>] [--browser <path>] [--full]'

/**
 * `mechanica shot <blockId>` / `mechanica shot /page/path` — render one block
 * through the dev preview route (or a whole page, editor overlay stripped) in
 * a headless Chromium and write PNG screenshot(s). Made for agent loops:
 * prints the image paths plus any console/render errors, and fails loudly when
 * the block or page failed to render.
 */
export async function runShot(target: string | undefined, options: ShotOptions = {}): Promise<void> {
  // A target starting with `/` is a page path; block ids are kebab-case names.
  const rawPage = options.page ?? (target?.startsWith('/') ? target : undefined)
  const pagePath = rawPage ? normalizePagePath(rawPage) : undefined
  const blockId = pagePath ? undefined : target
  if (!pagePath && !blockId) throw new Error(USAGE)
  if (pagePath && options.data) throw new Error('--data applies to block shots only')

  const widths = parseWidths(options.width)
  const data = resolveDataArg(options.data)

  const server = await resolveServer(options.server)
  let browser: LaunchedBrowser | undefined
  try {
    browser = await launchBrowser(options.browser)
    const cdp = browser.client

    // A fresh page target, attached in "flat" mode so page-domain commands ride
    // the same socket with a session id.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

    const consoleLines: string[] = []
    cdp.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'warning')) {
        const text = (params.args ?? [])
          .map((arg: { value?: unknown; description?: string }) => arg.value ?? arg.description ?? '')
          .join(' ')
        consoleLines.push(`[console.${params.type}] ${text}`)
      }
      if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails
        consoleLines.push(`[pageerror] ${details?.exception?.description ?? details?.text ?? 'unknown error'}`)
      }
    })

    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Page.enable', {}, sessionId)
    await setViewport(cdp, sessionId, widths[0]!)
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      sessionId,
    )

    // Page mode strips the editor overlay via ?mechanica-shot; block mode goes
    // through the standalone preview route.
    if (pagePath) await ensurePageExists(server.origin, pagePath)
    const url = pagePath
      ? `${server.origin}${pagePath}?mechanica-shot=1`
      : previewUrl(server.origin, blockId!, data)
    const navigation = await cdp.send('Page.navigate', { url }, sessionId)
    if (navigation.errorText) {
      throw new Error(`Failed to open ${url}: ${navigation.errorText} (is this a Mechanica project?)`)
    }

    let previewError: string | null = null
    if (pagePath) {
      // Normal pages have no ready flag; wait for load, then fonts and images.
      await waitForCondition(cdp, sessionId, "document.readyState === 'complete'", 15_000)
      await settlePageMedia(cdp, sessionId)
    } else {
      await waitForCondition(cdp, sessionId, 'window.__MECHANICA_PREVIEW_READY__ === true', 15_000)
      previewError = await evaluateValue<string | null>(
        cdp,
        sessionId,
        'window.__MECHANICA_PREVIEW_ERROR__ ?? null',
      )
    }
    await freezeAnimations(cdp, sessionId)

    const outputs: string[] = []
    for (const width of widths) {
      await setViewport(cdp, sessionId, width)
      // Two frames so responsive layout and lazy media settle at the new width.
      await cdp.send(
        'Runtime.evaluate',
        {
          expression: 'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))',
          awaitPromise: true,
        },
        sessionId,
      )

      const name = pagePath ? `page-${pageSlug(pagePath)}` : blockId!
      const out = outputPath(options.out, name, width, widths.length > 1)
      await mkdir(dirname(out), { recursive: true })

      const clipToBlock = !pagePath && !options.full && !previewError
      const blockClip = clipToBlock
        ? await evaluateValue<{ x: number; y: number; width: number; height: number } | null>(
            cdp,
            sessionId,
            `(() => {
              const el = document.querySelector('[data-block-id]')
              if (!el) return null
              const rect = el.getBoundingClientRect()
              if (rect.width < 1 || rect.height < 1) return null
              return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
            })()`,
          )
        : null
      const clip = blockClip ?? (await fullPageClip(cdp, sessionId))

      const shot = await cdp.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } },
        sessionId,
      )
      fs.writeFileSync(out, Buffer.from(shot.data as string, 'base64'))
      outputs.push(out)
    }

    for (const line of consoleLines) console.info(line)
    for (const out of outputs) console.info(`✓ ${out}`)
    if (previewError) throw new Error(`Block preview failed: ${previewError}`)
    if (pagePath && consoleLines.some((line) => line.startsWith('[pageerror]'))) {
      throw new Error('The page threw while rendering — see the [pageerror] output above')
    }
  } finally {
    await browser?.close()
    await server.close()
  }
}

/** Fail early with the list of real pages instead of shooting an empty 200. */
async function ensurePageExists(origin: string, pagePath: string): Promise<void> {
  let pages: Array<{ path: string }> | null = null
  try {
    const res = await fetch(`${origin}/@mechanica/pages`)
    if (res.ok) pages = (await res.json()) as Array<{ path: string }>
  } catch {
    /* can't validate (older server?) — let navigation proceed */
  }
  if (!pages || pages.some((page) => page.path === pagePath)) return
  const known = pages.map((page) => page.path).sort().join(', ')
  throw new Error(`Unknown page "${pagePath}". Available pages: ${known}`)
}
