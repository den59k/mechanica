/**
 * Headless-browser plumbing shared by `mechanica shot` and `mechanica thumbs`:
 * dev-server discovery, browser discovery/spawn, and a minimal CDP client.
 *
 * Talks raw CDP over the platform `WebSocket` instead of using an automation
 * library: Playwright/Puppeteer launch handshakes rely on Node-only fd pipes
 * that hang under Bun, and screenshots need only a handful of CDP calls.
 */
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

// ── Dev server discovery ─────────────────────────────────────────────────────

export interface ResolvedServer {
  origin: string
  close: () => Promise<void>
}

/**
 * Find a dev server to render against: an explicit origin, a running local
 * Mechanica dev server, or an ephemeral one booted from the project's
 * `vite.config.ts` and torn down afterwards.
 */
export async function resolveServer(flag?: string): Promise<ResolvedServer> {
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

// ── Page-session helpers ─────────────────────────────────────────────────────

export async function setViewport(
  cdp: CdpClient,
  sessionId: string,
  width: number,
  height = 900,
): Promise<void> {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  )
}

export async function evaluateValue<T>(cdp: CdpClient, sessionId: string, expression: string): Promise<T> {
  const reply = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
  return reply.result?.value as T
}

/**
 * Poll an expression on the page until it is `true` or the timeout elapses.
 * Evaluate errors (execution context destroyed mid-navigation) count as "not
 * ready yet" rather than failing the wait.
 */
export async function waitForCondition(
  cdp: CdpClient,
  sessionId: string,
  expression: string,
  timeout: number,
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await evaluateValue<boolean>(cdp, sessionId, expression)) return
    } catch {
      /* navigation in flight — retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out after ${timeout}ms waiting for the page to become ready`)
}

/** Wait for web fonts and all images — normal pages have no injected ready flag. */
export async function settlePageMedia(cdp: CdpClient, sessionId: string): Promise<void> {
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `Promise.all([
        document.fonts ? document.fonts.ready : null,
        ...[...document.images].map((img) =>
          img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done })),
      ].filter(Boolean)).then(() => true)`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  )
}

/** Freeze animations/transitions so captures are deterministic across runs. */
export async function freezeAnimations(cdp: CdpClient, sessionId: string): Promise<void> {
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
}

/** Chromium refuses to encode arbitrarily tall captures — cap and say so. */
export const MAX_SHOT_HEIGHT = 12_000

/** The full document size as a screenshot clip. */
export async function fullPageClip(
  cdp: CdpClient,
  sessionId: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId)
  const size = metrics.cssContentSize ?? metrics.contentSize
  const height = Math.min(size.height, MAX_SHOT_HEIGHT)
  if (height < size.height) {
    console.info(`(page is ${Math.round(size.height)}px tall — clipped to ${MAX_SHOT_HEIGHT}px)`)
  }
  return { x: 0, y: 0, width: size.width, height }
}

// ── Browser process + CDP transport ──────────────────────────────────────────

export interface LaunchedBrowser {
  client: CdpClient
  close: () => Promise<void>
}

/**
 * Spawn a headless Chromium-based browser with a DevTools endpoint and connect
 * to it. Prefers browsers already on the machine (Edge ships with Windows,
 * Chrome is everywhere), so nothing needs downloading.
 */
export async function launchBrowser(explicitPath?: string): Promise<LaunchedBrowser> {
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

/** Find a Chromium-based executable: an explicit path, or a known install location. */
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
export class CdpClient {
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
