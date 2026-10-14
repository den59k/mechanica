import fs from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openPage, NavigationError, type BrowserPage } from './browser'
import { resolveServer, type ResolvedServer } from './dev-server'

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
  /** Screenshot the full page instead of clipping to the block element (or to the viewport with `scroll`). */
  full?: boolean
  /** CSS selectors (`--section`, repeatable): one PNG each, clipped to the first match. Page/URL/file shots only. */
  section?: string[]
  /** Scroll offset(s) in px, comma-separated: capture the viewport scrolled there. */
  scroll?: string
  /** Leave CSS animations and transitions running (`--no-freeze`). */
  noFreeze?: boolean
}

/**
 * What `mechanica shot` renders: a block through the preview route, a page of
 * this project on the dev server, or a foreign document — any `http(s)://` URL
 * or a local file (a design handoff's `index.html`) — opened as is.
 */
export type ShotTarget =
  | { kind: 'block'; blockId: string }
  | { kind: 'page'; path: string }
  | { kind: 'url'; url: string }
  /** `file` is the path on disk when the URL maps to one (checked before launching). */
  | { kind: 'file'; url: string; file?: string }

/** How one capture is framed. */
export type CaptureMode = 'block' | 'section' | 'full' | 'viewport'

/** Everything `runShot` needs, resolved and validated before any browser starts. */
export interface ShotPlan {
  target: ShotTarget
  /** Base output name (without section/scroll/width suffixes). */
  name: string
  widths: number[]
  /** Scroll offsets to capture at, in order; undefined = no scrolling. */
  scrolls?: number[]
  sections: Array<{ selector: string; slug: string }>
  data?: Record<string, unknown>
  mode: CaptureMode
  freeze: boolean
}

const USAGE =
  'Usage: mechanica shot <blockId | /page/path | URL | file.html> [--page </path>] [--data <json|@file>] ' +
  '[--width 1440,768] [--section <css>]… [--scroll <px[,px…]>] [--no-freeze] [--full] [--out <path>] ' +
  '[--server <url>] [--browser <path>]'

/** Readiness flag of the standalone block preview route. */
export const PREVIEW_READY = 'window.__MECHANICA_PREVIEW_READY__ === true'

/** Parse a `--width` value into a list of positive integers. Defaults to `[1440]`. */
export function parseWidths(value: string | undefined): number[] {
  if (!value) return [1440]
  const widths = value.split(',').map((part) => Number.parseInt(part.trim(), 10))
  if (widths.length === 0 || widths.some((w) => !Number.isFinite(w) || w <= 0)) {
    throw new Error(`Invalid --width value "${value}" — expected e.g. 1440 or 1440,768,390`)
  }
  return widths
}

/** Parse a `--scroll` value (px from the top, comma-separated). Undefined when absent. */
export function parseScrolls(value: string | undefined): number[] | undefined {
  if (value === undefined) return undefined
  const parts = value.split(',').map((part) => part.trim())
  if (parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Invalid --scroll value "${value}" — expected pixels from the top, e.g. 800 or 0,800,1600`)
  }
  return parts.map(Number)
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

/**
 * Resolve the output PNG path for one capture. `variant` (`-<section>`,
 * `-y<scroll>`) is always part of the name; the `-w<width>` suffix only when
 * shooting several widths. An `--out` ending in `.png` is a file name, any
 * other value a directory.
 */
export function outputPath(
  out: string | undefined,
  name: string,
  width: number,
  multi: boolean,
  variant = '',
): string {
  const suffix = `${variant}${multi ? `-w${width}` : ''}`
  if (!out) return join('.mech', 'shots', `${name}${suffix}.png`)
  if (out.endsWith('.png')) return suffix ? out.replace(/\.png$/, `${suffix}.png`) : out
  return join(out, `${name}${suffix}.png`)
}

/** The name suffix of one capture: `-<section slug>` and/or `-y<scroll>`. */
export function shotVariant(sectionSlug?: string, scroll?: number): string {
  return `${sectionSlug ? `-${sectionSlug}` : ''}${scroll !== undefined ? `-y${scroll}` : ''}`
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

/** Lowercase letters and digits (any script) joined by single dashes. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * One file-name slug per `--section` selector: `#hero` → `hero`,
 * `.stage > .pin` → `stage-pin`. A selector with no letters or digits becomes
 * `section`; repeats get `-2`, `-3`…
 */
export function sectionSlugs(selectors: string[]): string[] {
  const seen = new Map<string, number>()
  return selectors.map((selector) => {
    const base = slugify(selector).slice(0, 40).replace(/-+$/, '') || 'section'
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/
const RELATIVE_PATH = /^\.\.?[\\/]/
const HTML_FILE = /\.html?$/i

/**
 * Classify a `shot` target, in this order:
 * - `--page </path>` → that page;
 * - `http://…` / `https://…` → a URL, opened as is;
 * - `file://…`, a Windows drive path (`C:\…`), a `./` or `../` path, or any
 *   path ending in `.html`/`.htm` → a local file (relative to `cwd`);
 * - anything else starting with `/` → a page of this project;
 * - anything else → a block id.
 */
export function classifyTarget(target: string | undefined, page?: string, cwd = process.cwd()): ShotTarget {
  if (page) return { kind: 'page', path: normalizePagePath(page) }
  const value = target?.trim()
  if (!value) throw new Error(USAGE)
  if (/^https?:\/\//i.test(value)) return { kind: 'url', url: parseUrl(value) }
  if (/^file:\/\//i.test(value)) {
    const url = parseUrl(value)
    return { kind: 'file', url, file: filePathOf(url) }
  }
  if (WINDOWS_DRIVE_PATH.test(value) || RELATIVE_PATH.test(value) || HTML_FILE.test(value)) {
    const file = resolve(cwd, value)
    return { kind: 'file', url: pathToFileURL(file).href, file }
  }
  if (value.startsWith('/')) return { kind: 'page', path: normalizePagePath(value) }
  return { kind: 'block', blockId: value }
}

function parseUrl(value: string): string {
  try {
    return new URL(value).href
  } catch {
    throw new Error(`Invalid URL "${value}"`)
  }
}

function filePathOf(url: string): string | undefined {
  try {
    return fileURLToPath(url)
  } catch {
    return undefined // e.g. a file://host/… URL on a system without UNC paths
  }
}

/**
 * Default output name of a URL or file shot:
 * - a URL → its host (no `www.`, port appended) and path, extension dropped:
 *   `https://example.com/business/evolve` → `example-com-business-evolve`;
 * - a file → its path relative to `cwd` (or its last three path segments when
 *   it lies outside), extension dropped: `design/evolve-level/index.html` →
 *   `design-evolve-level-index`.
 */
export function foreignShotName(target: ShotTarget, cwd = process.cwd()): string {
  if (target.kind === 'url') {
    const url = new URL(target.url)
    const host = url.hostname.replace(/^www\./, '') + (url.port ? `-${url.port}` : '')
    return slugify(`${host}/${stripExtension(url.pathname)}`) || 'shot'
  }
  if (target.kind !== 'file') throw new Error(`Not a URL or file target: ${target.kind}`)
  const file = target.file ?? decodeURIComponent(new URL(target.url).pathname)
  const rel = relative(cwd, file)
  const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  const segments = (inside ? rel : file).split(/[\\/]+/).filter(Boolean)
  return slugify(stripExtension((inside ? segments : segments.slice(-3)).join('/'))) || 'shot'
}

function stripExtension(path: string): string {
  return path.replace(/\.[^./\\]+$/, '')
}

/**
 * How each capture is framed: `--section` boxes, else `--full` (whole
 * document), else the viewport when scrolling (so sticky/pinned states are
 * what's in the picture), else the block element for block shots and the
 * whole document for pages, URLs and files.
 */
export function captureMode(
  kind: ShotTarget['kind'],
  flags: { section?: boolean; full?: boolean; scroll?: boolean },
): CaptureMode {
  if (flags.section) return 'section'
  if (flags.full) return 'full'
  if (flags.scroll) return 'viewport'
  return kind === 'block' ? 'block' : 'full'
}

/** Resolve and validate a `shot` invocation without touching a browser or a server. */
export function planShot(target: string | undefined, options: ShotOptions = {}, cwd = process.cwd()): ShotPlan {
  const shotTarget = classifyTarget(target, options.page, cwd)
  const isBlock = shotTarget.kind === 'block'
  if (!isBlock && options.data) throw new Error('--data applies to block shots only')

  const selectors = options.section ?? []
  if (selectors.length && isBlock) {
    throw new Error('--section applies to page, URL and file shots — a block shot is already clipped to its block')
  }
  if (selectors.some((selector) => !selector.trim())) {
    throw new Error('--section needs a CSS selector, e.g. --section "#hero"')
  }
  const slugs = sectionSlugs(selectors)
  const scrolls = parseScrolls(options.scroll)

  return {
    target: shotTarget,
    name:
      shotTarget.kind === 'block'
        ? shotTarget.blockId
        : shotTarget.kind === 'page'
          ? `page-${pageSlug(shotTarget.path)}`
          : foreignShotName(shotTarget, cwd),
    widths: parseWidths(options.width),
    scrolls,
    sections: selectors.map((selector, index) => ({ selector: selector.trim(), slug: slugs[index]! })),
    data: resolveDataArg(options.data),
    mode: captureMode(shotTarget.kind, { section: selectors.length > 0, full: options.full, scroll: !!scrolls }),
    freeze: !options.noFreeze,
  }
}

/**
 * `mechanica shot <target>` — render one block through the dev preview route,
 * a whole page (editor overlay stripped), or a foreign document (any URL, or
 * a local `.html` file such as a design handoff) in a headless Chromium and
 * write PNG screenshot(s): per width, per scroll offset, per `--section`.
 * Made for agent loops: prints the image paths plus any console/render errors,
 * and fails loudly when the block or page failed to render.
 */
export async function runShot(target: string | undefined, options: ShotOptions = {}): Promise<void> {
  const plan = planShot(target, options)
  const shotTarget = plan.target
  if (shotTarget.kind === 'file' && shotTarget.file) checkLocalFile(shotTarget.file, target!)
  // Foreign targets need no dev server: nothing to resolve, start or validate.
  const local = shotTarget.kind === 'block' || shotTarget.kind === 'page'
  const server = local ? await resolveServer(options.server) : undefined

  let page: BrowserPage | undefined
  try {
    page = await openPage(undefined, { width: plan.widths[0], browser: options.browser })

    if (shotTarget.kind === 'page') await ensurePageExists(server!.origin, shotTarget.path)
    const url = shotUrl(shotTarget, server, plan.data)
    try {
      // Block mode waits for the preview route's ready flag; everything else
      // for the load event, then fonts and images.
      await page.goto(url, shotTarget.kind === 'block' ? { ready: PREVIEW_READY, settle: false } : {})
    } catch (error) {
      if (!(error instanceof NavigationError)) throw error
      throw new Error(local ? `${error.message} (is this a Mechanica project?)` : error.message)
    }

    const previewError =
      shotTarget.kind === 'block'
        ? await page.evaluate<string | null>('window.__MECHANICA_PREVIEW_ERROR__ ?? null')
        : null
    // With --scroll the freeze comes after each scroll (below), so the page's
    // own scroll handlers and transitions reach their state first.
    if (plan.freeze && !plan.scrolls) await page.freezeAnimations()

    const outputs: string[] = []
    const failures: string[] = []
    for (const width of plan.widths) {
      await page.setViewport(width)
      // Two frames so responsive layout and lazy media settle at the new width.
      await page.nextFrame()

      for (const scroll of plan.scrolls ?? [undefined]) {
        if (scroll !== undefined) {
          if (plan.freeze) await page.unfreezeAnimations()
          const reached = await page.scrollTo(scroll)
          if (reached + 1 < scroll) console.info(`(at ${width}px the page scrolls only to ${Math.round(reached)}px)`)
          await page.settle()
          // Freezing ends running transitions at their final values.
          if (plan.freeze) await page.freezeAnimations()
        }

        for (const section of plan.sections.length ? plan.sections : [undefined]) {
          const out = outputPath(options.out, plan.name, width, plan.widths.length > 1, shotVariant(section?.slug, scroll))
          let png: Buffer
          try {
            png = await capture(page, plan.mode, section?.selector, previewError)
          } catch (error) {
            if (!section) throw error
            const where = `at ${width}px` + (scroll !== undefined ? `, scrolled to ${scroll}px` : '')
            failures.push(`--section "${section.selector}" ${where}: ${error instanceof Error ? error.message : error}`)
            continue
          }
          await mkdir(dirname(out), { recursive: true })
          fs.writeFileSync(out, png)
          outputs.push(out)
        }
      }
    }

    for (const line of page.messages) console.info(line)
    for (const out of outputs) console.info(`✓ ${out}`)
    if (previewError) throw new Error(`Block preview failed: ${previewError}`)
    // A foreign document's own errors are reported above but never fail the shot.
    if (shotTarget.kind === 'page' && page.messages.some((line) => line.startsWith('[pageerror]'))) {
      throw new Error('The page threw while rendering — see the [pageerror] output above')
    }
    if (failures.length === 1) throw new Error(failures[0])
    if (failures.length) {
      for (const failure of failures) console.error(`✗ ${failure}`)
      throw new Error(`${failures.length} section captures failed — see the ✗ lines above`)
    }
  } finally {
    await page?.close()
    await server?.close()
  }
}

/** A local target must be an existing file — a directory would render as a file listing. */
function checkLocalFile(file: string, raw: string): void {
  const stat = fs.statSync(file, { throwIfNoEntry: false })
  if (stat?.isFile()) return
  const problem = stat ? `${file} is a directory, not an HTML file` : `File not found: ${file}`
  // Git Bash (MSYS) rewrites a `/page/path` argument into a Windows path
  // under its install folder before the CLI sees it.
  const msys = process.env.MSYSTEM && !HTML_FILE.test(raw) && WINDOWS_DRIVE_PATH.test(raw)
  throw new Error(
    msys
      ? `${problem}. If you meant a page path, Git Bash rewrote it: write it with two slashes (//about) or set MSYS_NO_PATHCONV=1`
      : problem,
  )
}

function shotUrl(target: ShotTarget, server: ResolvedServer | undefined, data?: Record<string, unknown>): string {
  switch (target.kind) {
    case 'block':
      return previewUrl(server!.origin, target.blockId, data)
    case 'page':
      // ?mechanica-shot strips the editor overlay.
      return `${server!.origin}${target.path}?mechanica-shot=1`
    default:
      return target.url
  }
}

async function capture(
  page: BrowserPage,
  mode: CaptureMode,
  selector: string | undefined,
  previewError: string | null,
): Promise<Buffer> {
  switch (mode) {
    case 'section':
      return page.screenshot({ section: selector })
    case 'viewport':
      return page.screenshot()
    case 'full':
      return page.screenshot({ full: true })
    case 'block': {
      // Clip to the rendered block; a failed preview shows the whole error page.
      const clip = previewError ? null : await page.sectionClip('[data-block-id]').catch(() => null)
      return page.screenshot(clip ? { clip } : { full: true })
    }
  }
}

/** Fail early with the list of real pages instead of shooting an empty 200. */
async function ensurePageExists(origin: string, pagePath: string): Promise<void> {
  let pages: Array<{ path: string }> | null = null
  // The state builder resolves a locale prefix (/ru/about) and a pagination
  // variant (/blog/2) down to the logical page path — so validating that
  // resolved path handles both without the CLI needing the locale config.
  let logical = pagePath
  try {
    const [pagesRes, stateRes] = await Promise.all([
      fetch(`${origin}/@mechanica/pages`),
      fetch(`${origin}/@mechanica/state?path=${encodeURIComponent(pagePath)}`),
    ])
    if (pagesRes.ok) pages = (await pagesRes.json()) as Array<{ path: string }>
    if (stateRes.ok) {
      const resolved = (await stateRes.json())?.page?.path
      if (typeof resolved === 'string') logical = resolved
    }
  } catch {
    /* can't validate (older server?) — let navigation proceed */
  }
  if (!pages || pages.some((page) => page.path === logical)) return
  const known = pages.map((page) => page.path).sort().join(', ')
  throw new Error(`Unknown page "${pagePath}". Available pages: ${known}`)
}
