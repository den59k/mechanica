import fs from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Browser } from 'playwright-core'

export interface ShotOptions {
  /** Prop overrides: inline JSON, or `@path/to/file.json`. */
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
  const raw = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf-8') : value
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
export function outputPath(out: string | undefined, blockId: string, width: number, multi: boolean): string {
  const suffix = multi ? `-w${width}` : ''
  if (!out) return join('.mech', 'shots', `${blockId}${suffix}.png`)
  if (out.endsWith('.png')) return multi ? out.replace(/\.png$/, `${suffix}.png`) : out
  return join(out, `${blockId}${suffix}.png`)
}

/**
 * `mechanica shot <blockId>` — render one block through the dev preview route
 * in a headless Chromium and write PNG screenshot(s). Made for agent loops:
 * prints the image paths plus any console/render errors, and fails loudly when
 * the block itself failed to render.
 */
export async function runShot(blockId: string | undefined, options: ShotOptions = {}): Promise<void> {
  if (!blockId) {
    throw new Error(
      'Usage: mechanica shot <blockId> [--data <json|@file>] [--width 1440,768] [--out <path>] [--server <url>] [--browser <path>] [--full]',
    )
  }
  const widths = parseWidths(options.width)
  const data = resolveDataArg(options.data)

  const server = await resolveServer(options.server)
  let browser: Browser | undefined
  try {
    browser = await launchBrowser(options.browser)
    const page = await browser.newPage({ viewport: { width: widths[0]!, height: 900 } })

    const consoleLines: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleLines.push(`[console.${message.type()}] ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`))

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(previewUrl(server.origin, blockId, data))
    await page.waitForFunction('window.__MECHANICA_PREVIEW_READY__ === true', undefined, {
      timeout: 15_000,
    })
    const previewError = await page.evaluate<string | undefined>('window.__MECHANICA_PREVIEW_ERROR__')
    // Freeze animations/transitions so shots are deterministic across runs.
    await page.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
    })

    const outputs: string[] = []
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      // Two frames so responsive layout and lazy media settle at the new width.
      await page.evaluate(
        'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))',
      )
      const out = outputPath(options.out, blockId, width, widths.length > 1)
      await mkdir(dirname(out), { recursive: true })

      const block = page.locator('[data-block-id]').first()
      const clipToBlock = !options.full && !previewError && (await block.count()) > 0
      try {
        if (clipToBlock) await block.screenshot({ path: out })
        else await page.screenshot({ path: out, fullPage: true })
      } catch {
        // Zero-size or detached block element — fall back to the full page.
        await page.screenshot({ path: out, fullPage: true })
      }
      outputs.push(out)
    }

    for (const line of consoleLines) console.info(line)
    for (const out of outputs) console.info(`✓ ${out}`)
    if (previewError) throw new Error(`Block preview failed: ${previewError}`)
  } finally {
    await browser?.close()
    await server.close()
  }
}

interface ResolvedServer {
  origin: string
  close: () => Promise<void>
}

/**
 * Find a dev server to shoot against: an explicit `--server`, a running local
 * Mechanica dev server, or an ephemeral one booted from the project's
 * `vite.config.ts` and torn down afterwards.
 */
async function resolveServer(flag?: string): Promise<ResolvedServer> {
  if (flag) return { origin: flag.replace(/\/+$/, ''), close: async () => {} }

  for (const origin of ['http://127.0.0.1:5173', 'http://localhost:5173']) {
    if (await isMechanicaServer(origin)) return { origin, close: async () => {} }
  }

  console.info('No running dev server found — starting one…')
  const { createServer } = await import('vite')
  const server = await createServer({ logLevel: 'warn' })
  await server.listen()
  const origin = server.resolvedUrls?.local[0]?.replace(/\/+$/, '')
  if (!origin) {
    await server.close()
    throw new Error('Failed to start a dev server (no resolved URL)')
  }
  return { origin, close: () => server.close() }
}

async function isMechanicaServer(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/@mechanica/folders`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Launch a headless Chromium via playwright-core. Prefers browsers already on
 * the machine (Edge ships with Windows, Chrome is everywhere) so no download
 * is needed; falls back to Playwright's own Chromium if installed.
 */
async function launchBrowser(executablePath?: string): Promise<Browser> {
  let chromium: (typeof import('playwright-core'))['chromium']
  try {
    chromium = (await import('playwright-core')).chromium
  } catch {
    throw new Error(
      '`mechanica shot` needs playwright-core — install it with: bun add -d playwright-core',
    )
  }

  const attempts: Array<{ label: string; options: { channel?: string; executablePath?: string } }> =
    executablePath
      ? [{ label: `--browser ${executablePath}`, options: { executablePath } }]
      : [
          { label: 'Microsoft Edge', options: { channel: 'msedge' } },
          { label: 'Google Chrome', options: { channel: 'chrome' } },
          { label: 'Playwright Chromium', options: {} },
        ]

  const failures: string[] = []
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, ...attempt.options })
    } catch (error) {
      failures.push(`  ${attempt.label}: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
    }
  }
  throw new Error(
    `No Chromium-based browser could be launched:\n${failures.join('\n')}\n` +
      'Install one with `bunx playwright install chromium`, or pass --browser <path-to-chrome/edge>.',
  )
}
