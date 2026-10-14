/**
 * `mechanica/browser` — the headless browser behind `mechanica shot` and
 * `mechanica thumbs`, for a site's own scripts: open a page (a dev-server URL,
 * a design handoff's `file://` URL, any site), resize it, scroll it, measure it
 * with `evaluate`, and screenshot it or one section of it.
 *
 * Drives a Chrome/Edge already installed on the machine over raw CDP
 * (`headless.ts`), so there is nothing to download. Needs a global `WebSocket`
 * (Node 22+ or Bun) and never imports Vite.
 */
import {
  launchBrowser,
  setViewport,
  waitForCondition,
  settlePageMedia,
  freezeAnimations,
  unfreezeAnimations,
  nextFrames,
  fullPageClip,
  viewportClip,
  MAX_SHOT_HEIGHT,
  SETTLE_TIMEOUT,
  type Clip,
  type LaunchedBrowser,
} from './headless'
import { FIND_SECTION_SOURCE, blockIdFallback, splitShadowSelector } from './section-query'

export { findDevServer, MAX_SHOT_HEIGHT, type Clip } from './headless'

/** Readiness of an ordinary page: the load event has fired. */
export const PAGE_LOADED = "document.readyState === 'complete'"

const DEFAULT_WIDTH = 1440
const DEFAULT_HEIGHT = 900
const DEFAULT_TIMEOUT = 15_000

export interface GotoOptions {
  /** JS expression polled until it is `true`. Default: {@link PAGE_LOADED}. */
  ready?: string
  /** Then wait for web fonts and images (see {@link BrowserPage.settle}). Default `true`. */
  settle?: boolean
  /** How long `ready` may take, in ms. Default 15 000. */
  timeout?: number
}

export interface OpenPageOptions extends GotoOptions {
  /** Viewport width in CSS px. Default 1440. */
  width?: number
  /** Viewport height in CSS px. Default 900. */
  height?: number
  /**
   * A Chromium-based executable. Default: the first installed browser that
   * starts, from the usual install paths (on Windows Chrome, then Edge).
   */
  browser?: string
  /**
   * Emulate `prefers-reduced-motion: reduce`, as `mechanica shot` does: pages
   * that honor it skip their entrance animations. Default `true`.
   */
  reducedMotion?: boolean
}

export interface ScreenshotOptions {
  /** An explicit region in document coordinates. Wins over everything else. */
  clip?: Clip
  /** A CSS selector: the bounding box of the first matching element (see {@link BrowserPage.sectionClip}). */
  section?: string
  /** The whole document (height capped at {@link MAX_SHOT_HEIGHT}). */
  full?: boolean
  /** Output scale: `0.5` writes a half-size PNG. Default 1. */
  scale?: number
}

/** `goto` could not open the URL at all (DNS, refused connection, missing file…). */
export class NavigationError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`Failed to open ${url}: ${reason}`)
    this.name = 'NavigationError'
  }
}

/** One headless tab in its own browser process. */
export interface BrowserPage {
  /** Console errors/warnings and uncaught exceptions, as `[console.error] …` / `[pageerror] …` lines. */
  readonly messages: string[]
  /** Navigate, then wait for `ready` and (by default) fonts + images. */
  goto(url: string, options?: GotoOptions): Promise<void>
  /** Evaluate an expression in the page (promises are awaited) and return its JSON value. Throws on a page exception. */
  evaluate<T = unknown>(expression: string): Promise<T>
  /** Poll `expression` until it is `true`. */
  waitFor(expression: string, timeout?: number): Promise<void>
  /** Resize the viewport (height defaults to the current one). */
  setViewport(width: number, height?: number): Promise<void>
  /** Scroll the window to `y` instantly (ignoring `scroll-behavior: smooth`), wait two frames, return the reached `scrollY`. */
  scrollTo(y: number): Promise<number>
  /** Wait two animation frames: one full style → layout → paint cycle. */
  nextFrame(): Promise<void>
  /** Wait for web fonts and images; lazy images are switched to eager. Gives up after 10 s. */
  settle(): Promise<void>
  /** Turn off CSS animations and transitions (running transitions jump to their end). Idempotent. */
  freezeAnimations(): Promise<void>
  /** Undo {@link freezeAnimations}. */
  unfreezeAnimations(): Promise<void>
  /**
   * The document-coordinate box of the first element matching `selector`.
   * Looks in the document, then in every open shadow root (`host >>> inner`
   * crosses into `host`'s shadow root explicitly). A bare `#name` or `name`
   * that matches nothing falls back to `[data-block-id="name"]`, a Mechanica
   * block. Throws when nothing matches or the box is empty.
   */
  sectionClip(selector: string): Promise<Clip>
  /**
   * A PNG of the page: `clip`, else `section`, else `full`, else what is in
   * the viewport right now (at the current scroll position).
   */
  screenshot(options?: ScreenshotOptions): Promise<Buffer>
  /** A raw CDP command on this tab's session, for anything not covered above. */
  send(method: string, params?: object): Promise<any>
  /** Close the browser and remove its temporary profile. */
  close(): Promise<void>
}

/**
 * Launch a headless browser with one tab, sized and media-emulated like
 * `mechanica shot`, and open `url` in it (omit `url` for a blank tab to
 * `goto` later). Always `close()` the page — it owns the browser process.
 *
 * ```ts
 * import { openPage } from 'mechanica/browser'
 *
 * const page = await openPage('file:///…/design/index.html', { width: 390 })
 * try {
 *   const size = await page.evaluate<string>(`getComputedStyle(document.querySelector('h1')).fontSize`)
 *   fs.writeFileSync('hero.png', await page.screenshot({ section: '#hero' }))
 * } finally {
 *   await page.close()
 * }
 * ```
 */
export async function openPage(url?: string, options: OpenPageOptions = {}): Promise<BrowserPage> {
  const browser = await launchBrowser(options.browser)
  try {
    const page = await HeadlessPage.create(browser, options)
    if (url) await page.goto(url, options)
    return page
  } catch (error) {
    await browser.close()
    throw error
  }
}

type SectionBox =
  | Clip
  | { error: 'invalid'; message: string }
  | {
      error: 'missing'
      /** Readable ids on the page (`#name`), shadow roots included. */
      ids: string[]
      /** `data-block-id` values on the page. */
      blockIds?: string[]
      /** The block-id selector that was tried as well. */
      fallback?: string | null
    }
  | { error: 'empty'; width: number; height: number }

/** The message for a `sectionClip` that found nothing usable. */
export function describeSectionError(selector: string, box: Exclude<SectionBox, Clip>): string {
  switch (box.error) {
    case 'invalid':
      return `"${selector}" is not a valid CSS selector (${box.message})`
    case 'missing':
      return (
        `No element matches "${selector}"` +
        (box.fallback ? ` (nor ${box.fallback})` : '') +
        (box.ids.length ? `. Ids on the page: ${box.ids.join(', ')}` : '') +
        (box.blockIds?.length ? `. Block ids (data-block-id): ${box.blockIds.join(', ')}` : '')
      )
    case 'empty':
      return (
        `"${selector}" matched an element with an empty box ` +
        `(${Math.round(box.width)}×${Math.round(box.height)}) — is it hidden at this width?`
      )
  }
}

class HeadlessPage implements BrowserPage {
  readonly messages: string[] = []
  private height: number

  private constructor(
    private readonly browser: LaunchedBrowser,
    private readonly sessionId: string,
    height: number,
  ) {
    this.height = height
  }

  static async create(browser: LaunchedBrowser, options: OpenPageOptions): Promise<HeadlessPage> {
    const cdp = browser.client
    // A fresh page target, attached in "flat" mode so page-domain commands ride
    // the same socket with a session id.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new HeadlessPage(browser, sessionId, options.height ?? DEFAULT_HEIGHT)

    cdp.onEvent((method, params, eventSession) => {
      if (eventSession !== sessionId) return
      if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'warning')) {
        const text = (params.args ?? [])
          .map((arg: { value?: unknown; description?: string }) => arg.value ?? arg.description ?? '')
          .join(' ')
        page.messages.push(`[console.${params.type}] ${text}`)
      }
      if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails
        page.messages.push(`[pageerror] ${details?.exception?.description ?? details?.text ?? 'unknown error'}`)
      }
    })

    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Page.enable', {}, sessionId)
    await setViewport(cdp, sessionId, options.width ?? DEFAULT_WIDTH, page.height)
    if (options.reducedMotion !== false) {
      await cdp.send(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
        sessionId,
      )
    }
    return page
  }

  send(method: string, params: object = {}): Promise<any> {
    return this.browser.client.send(method, params, this.sessionId)
  }

  async goto(url: string, options: GotoOptions = {}): Promise<void> {
    const navigation = await this.send('Page.navigate', { url })
    if (navigation.errorText) throw new NavigationError(url, navigation.errorText)
    await this.waitFor(options.ready ?? PAGE_LOADED, options.timeout ?? DEFAULT_TIMEOUT)
    if (options.settle !== false) await this.settle()
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const reply = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (reply.exceptionDetails) {
      const details = reply.exceptionDetails
      throw new Error(`Evaluation failed: ${details.exception?.description ?? details.text ?? 'unknown error'}`)
    }
    return reply.result?.value as T
  }

  waitFor(expression: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
    return waitForCondition(this.browser.client, this.sessionId, expression, timeout)
  }

  async setViewport(width: number, height = this.height): Promise<void> {
    this.height = height
    await setViewport(this.browser.client, this.sessionId, width, height)
  }

  async scrollTo(y: number): Promise<number> {
    await this.evaluate(`window.scrollTo({ top: ${Number(y)}, left: 0, behavior: 'instant' })`)
    await this.nextFrame()
    return this.evaluate<number>('scrollY')
  }

  nextFrame(): Promise<void> {
    return nextFrames(this.browser.client, this.sessionId)
  }

  settle(): Promise<void> {
    return settlePageMedia(this.browser.client, this.sessionId, SETTLE_TIMEOUT)
  }

  freezeAnimations(): Promise<void> {
    return freezeAnimations(this.browser.client, this.sessionId)
  }

  unfreezeAnimations(): Promise<void> {
    return unfreezeAnimations(this.browser.client, this.sessionId)
  }

  async sectionClip(selector: string): Promise<Clip> {
    let parts: string[]
    try {
      parts = splitShadowSelector(selector)
    } catch (error) {
      throw new Error(describeSectionError(selector, { error: 'invalid', message: (error as Error).message }))
    }
    const fallback = parts.length === 1 ? blockIdFallback(selector) : null
    const box = await this.evaluate<SectionBox>(`((find, parts, fallback) => {
      const found = find(parts, fallback)
      if (!found.element) return found
      const rect = found.element.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return { error: 'empty', width: rect.width, height: rect.height }
      return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
    })(${FIND_SECTION_SOURCE}, ${JSON.stringify(parts)}, ${JSON.stringify(fallback)})`)
    if ('error' in box) throw new Error(describeSectionError(selector, box))
    return box
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    const cdp = this.browser.client
    let clip: Clip
    // Clips beyond the viewport keep sticky/pinned elements where the current
    // scroll position puts them; only the plain viewport capture skips it.
    let beyondViewport = true
    if (options.clip) {
      clip = options.clip
    } else if (options.section) {
      const box = await this.sectionClip(options.section)
      clip = { ...box, height: Math.min(box.height, MAX_SHOT_HEIGHT) }
      if (clip.height < box.height) {
        console.info(`("${options.section}" is ${Math.round(box.height)}px tall — clipped to ${MAX_SHOT_HEIGHT}px)`)
      }
    } else if (options.full) {
      clip = await fullPageClip(cdp, this.sessionId)
    } else {
      clip = await viewportClip(cdp, this.sessionId)
      beyondViewport = false
    }
    const shot = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: beyondViewport,
      clip: { ...clip, scale: options.scale ?? 1 },
    })
    return Buffer.from(shot.data as string, 'base64')
  }

  close(): Promise<void> {
    return this.browser.close()
  }
}
