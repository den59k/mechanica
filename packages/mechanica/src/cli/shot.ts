import fs from 'node:fs'
import os from 'node:os'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

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
 *
 * Talks raw CDP over the platform WebSocket instead of using an automation
 * library: Playwright/Puppeteer launch handshakes rely on Node-only fd pipes
 * that hang under Bun, and a screenshot needs only a handful of CDP calls.
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

    const navigation = await cdp.send('Page.navigate', { url: previewUrl(server.origin, blockId, data) }, sessionId)
    if (navigation.errorText) {
      throw new Error(`Failed to open the preview route: ${navigation.errorText} (is this a Mechanica project?)`)
    }

    await waitForCondition(cdp, sessionId, 'window.__MECHANICA_PREVIEW_READY__ === true', 15_000)
    const previewError = await evaluateValue<string | null>(
      cdp,
      sessionId,
      'window.__MECHANICA_PREVIEW_ERROR__ ?? null',
    )
    // Freeze animations/transitions so shots are deterministic across runs.
    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `{
          const style = document.createElement('style')
          style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'
          document.head.appendChild(style)
        }`,
      },
      sessionId,
    )

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

      const out = outputPath(options.out, blockId, width, widths.length > 1)
      await mkdir(dirname(out), { recursive: true })

      const clip =
        options.full || previewError
          ? null
          : await evaluateValue<{ x: number; y: number; width: number; height: number } | null>(
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

      const shot = await cdp.send(
        'Page.captureScreenshot',
        {
          format: 'png',
          captureBeyondViewport: true,
          ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
        },
        sessionId,
      )
      fs.writeFileSync(out, Buffer.from(shot.data as string, 'base64'))
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

async function setViewport(cdp: CdpClient, sessionId: string, width: number): Promise<void> {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  )
}

async function evaluateValue<T>(cdp: CdpClient, sessionId: string, expression: string): Promise<T> {
  const reply = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
  return reply.result?.value as T
}

/** Poll an expression on the page until it is `true` or the timeout elapses. */
async function waitForCondition(
  cdp: CdpClient,
  sessionId: string,
  expression: string,
  timeout: number,
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluateValue<boolean>(cdp, sessionId, expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out after ${timeout}ms waiting for the preview to become ready`)
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

// ── Browser process + CDP transport ──────────────────────────────────────────

interface LaunchedBrowser {
  client: CdpClient
  close: () => Promise<void>
}

/**
 * Spawn a headless Chromium-based browser with a DevTools endpoint and connect
 * to it. Prefers browsers already on the machine (Edge ships with Windows,
 * Chrome is everywhere), so nothing needs downloading.
 */
async function launchBrowser(explicitPath?: string): Promise<LaunchedBrowser> {
  const executable = findBrowserExecutable(explicitPath)
  const userDataDir = fs.mkdtempSync(join(os.tmpdir(), 'mechanica-shot-'))
  const child = spawn(
    executable.path,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  const cleanup = async (): Promise<void> => {
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode != null) return resolve()
      child.once('exit', () => resolve())
      setTimeout(resolve, 3000)
    })
    child.kill()
    await exited
    // The profile dir can stay locked for a moment after exit on Windows.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true })
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
  }

  let endpoint: string
  try {
    endpoint = await waitForDevtoolsEndpoint(child, 20_000)
  } catch (error) {
    await cleanup()
    throw new Error(
      `Failed to start ${executable.label} (${executable.path}): ${error instanceof Error ? error.message : error}`,
    )
  }

  const client = await CdpClient.connect(endpoint)
  return {
    client,
    close: async () => {
      await client.send('Browser.close').catch(() => {})
      client.dispose()
      await cleanup()
    },
  }
}

/** Read the spawned browser's stderr until it prints its DevTools WebSocket URL. */
function waitForDevtoolsEndpoint(child: ChildProcess, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(
      () => reject(new Error(`no DevTools endpoint within ${timeout}ms`)),
      timeout,
    )
    child.stderr!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1]!)
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`browser exited early (code ${code})`))
    })
  })
}

interface BrowserExecutable {
  label: string
  path: string
}

/** Find a Chromium-based executable: `--browser`, or a known install location. */
function findBrowserExecutable(explicitPath?: string): BrowserExecutable {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) throw new Error(`--browser not found: ${explicitPath}`)
    return { label: 'browser from --browser', path: explicitPath }
  }

  const candidates = platformBrowserCandidates()
  const found = candidates.find((candidate) => fs.existsSync(candidate.path))
  if (!found) {
    const looked = candidates.map((c) => `  ${c.label}: ${c.path}`).join('\n')
    throw new Error(
      `No Chromium-based browser found. Looked for:\n${looked}\n` +
        'Install Chrome or Edge, or pass --browser <path-to-executable>.',
    )
  }
  return found
}

function platformBrowserCandidates(): BrowserExecutable[] {
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    const localAppData = process.env['LOCALAPPDATA'] ?? join(os.homedir(), 'AppData', 'Local')
    return [
      { label: 'Microsoft Edge', path: join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { label: 'Microsoft Edge', path: join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe') },
      { label: 'Google Chrome', path: join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') },
      { label: 'Google Chrome', path: join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') },
    ]
  }
  if (process.platform === 'darwin') {
    return [
      { label: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { label: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { label: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
    ]
  }
  return [
    { label: 'Google Chrome', path: '/usr/bin/google-chrome' },
    { label: 'Chromium', path: '/usr/bin/chromium' },
    { label: 'Chromium', path: '/usr/bin/chromium-browser' },
    { label: 'Microsoft Edge', path: '/usr/bin/microsoft-edge' },
  ]
}

type CdpEventListener = (method: string, params: any, sessionId?: string) => void

/**
 * A minimal Chrome DevTools Protocol client over the platform `WebSocket`
 * (native in Bun and Node ≥ 22): request/response matching by id, plus event
 * fan-out. Flat session mode — pass a `sessionId` to address a page target.
 */
class CdpClient {
  private nextId = 1
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  private listeners: CdpEventListener[] = []

  private constructor(private ws: WebSocket) {
    ws.onmessage = (event) => this.onMessage(String(event.data))
    ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'))
      this.pending.clear()
    }
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => reject(new Error(`CDP connect timeout: ${url}`)), 10_000)
      ws.onopen = () => {
        clearTimeout(timer)
        resolve(new CdpClient(ws))
      }
      ws.onerror = () => {
        clearTimeout(timer)
        reject(new Error(`CDP connection failed: ${url}`))
      }
    })
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  onEvent(listener: CdpEventListener): void {
    this.listeners.push(listener)
  }

  dispose(): void {
    try {
      this.ws.close()
    } catch {
      /* already closed */
    }
  }

  private onMessage(raw: string): void {
    const message = JSON.parse(raw)
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(`${message.error.message ?? 'CDP error'}`))
      else pending.resolve(message.result ?? {})
      return
    }
    if (typeof message.method === 'string') {
      for (const listener of this.listeners) listener(message.method, message.params ?? {}, message.sessionId)
    }
  }
}
