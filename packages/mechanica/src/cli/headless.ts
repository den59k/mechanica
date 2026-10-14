/**
 * Headless-browser plumbing shared by `mechanica shot`, `mechanica thumbs` and
 * the public `mechanica/browser` helper: browser discovery/spawn, a minimal
 * CDP client, page-session helpers, and probing for a running dev server.
 *
 * Talks raw CDP over the platform `WebSocket` instead of using an automation
 * library: Playwright/Puppeteer launch handshakes rely on Node-only fd pipes
 * that hang under Bun, and screenshots need only a handful of CDP calls.
 *
 * Never imports Vite: booting an ephemeral dev server lives in `dev-server.ts`,
 * so `mechanica/browser` stays usable from plain Node scripts.
 */
import fs from 'node:fs'
import os from 'node:os'
import { join, win32 } from 'node:path'
import { execFile, spawn, type ChildProcess } from 'node:child_process'

// ── Dev server probing ───────────────────────────────────────────────────────

/** Where `mechanica shot`/`thumbs` look for a running dev server first. */
export const DEV_SERVER_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']

/** The origin of a running Mechanica dev server on the default port, or null. */
export async function findDevServer(origins: string[] = DEV_SERVER_ORIGINS): Promise<string | null> {
  for (const origin of origins) {
    if (await isMechanicaServer(origin)) return origin
  }
  return null
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

/** Upper bound for {@link settlePageMedia}: a stalled image must not hang a shot. */
export const SETTLE_TIMEOUT = 10_000

/**
 * Wait for web fonts and all images — normal pages have no injected ready flag.
 * Lazy images are switched to eager first: below the fold they would never
 * start loading in a headless tab (the wait used to hang on them), and a
 * full-page capture should show them anyway. Gives up after `timeout` ms.
 */
export async function settlePageMedia(
  cdp: CdpClient,
  sessionId: string,
  timeout = SETTLE_TIMEOUT,
): Promise<void> {
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager'
        const media = Promise.all([
          document.fonts ? document.fonts.ready : null,
          ...[...document.images].map((img) =>
            img.complete ? null : new Promise((done) => {
              img.addEventListener('load', done, { once: true })
              img.addEventListener('error', done, { once: true })
            })),
        ].filter(Boolean))
        return Promise.race([media, new Promise((done) => setTimeout(done, ${timeout}))]).then(() => true)
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  )
}

const FREEZE_STYLE_ID = 'mechanica-freeze-animations'

/** Freeze animations/transitions so captures are deterministic across runs. Idempotent. */
export async function freezeAnimations(cdp: CdpClient, sessionId: string): Promise<void> {
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `{
        if (!document.getElementById('${FREEZE_STYLE_ID}')) {
          const style = document.createElement('style')
          style.id = '${FREEZE_STYLE_ID}'
          style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'
          document.head.appendChild(style)
        }
      }`,
    },
    sessionId,
  )
}

/** Undo {@link freezeAnimations}: transitions and animations run again. */
export async function unfreezeAnimations(cdp: CdpClient, sessionId: string): Promise<void> {
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.getElementById('${FREEZE_STYLE_ID}')?.remove()` },
    sessionId,
  )
}

/** Wait two animation frames: a full style → layout → paint cycle has run. */
export async function nextFrames(cdp: CdpClient, sessionId: string): Promise<void> {
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: 'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))',
      awaitPromise: true,
    },
    sessionId,
  )
}

/** Chromium refuses to encode arbitrarily tall captures — cap and say so. */
export const MAX_SHOT_HEIGHT = 12_000

/** A screenshot region in CSS pixels, relative to the document (not the viewport). */
export interface Clip {
  x: number
  y: number
  width: number
  height: number
}

/** The full document size as a screenshot clip. */
export async function fullPageClip(cdp: CdpClient, sessionId: string): Promise<Clip> {
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId)
  const size = metrics.cssContentSize ?? metrics.contentSize
  const height = Math.min(size.height, MAX_SHOT_HEIGHT)
  if (height < size.height) {
    console.info(`(page is ${Math.round(size.height)}px tall — clipped to ${MAX_SHOT_HEIGHT}px)`)
  }
  return { x: 0, y: 0, width: size.width, height }
}

/** What is on screen right now (the visual viewport at its scroll offset), as a clip. */
export async function viewportClip(cdp: CdpClient, sessionId: string): Promise<Clip> {
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId)
  const viewport = metrics.cssVisualViewport ?? metrics.visualViewport
  return { x: viewport.pageX, y: viewport.pageY, width: viewport.clientWidth, height: viewport.clientHeight }
}

// ── Browser process + CDP transport ──────────────────────────────────────────

export interface LaunchedBrowser {
  client: CdpClient
  close: () => Promise<void>
}

/** A Chromium-based browser executable to try. */
export interface BrowserExecutable {
  label: string
  path: string
}

/** How long a spawned browser may take to print its DevTools endpoint. */
const STARTUP_TIMEOUT = 20_000

/**
 * Spawn a headless Chromium-based browser with a DevTools endpoint and connect
 * to it. With `explicitPath` (`--browser`) only that executable is tried.
 * Otherwise the installed browsers of {@link platformBrowserCandidates} are
 * tried in order until one starts — a browser already on the machine, so
 * nothing needs downloading — and the error names each one that failed.
 */
export async function launchBrowser(explicitPath?: string): Promise<LaunchedBrowser> {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) throw new Error(`--browser not found: ${explicitPath}`)
    const executable = { label: 'browser from --browser', path: explicitPath }
    try {
      return await startBrowser(executable)
    } catch (error) {
      throw new Error(`Failed to start ${executable.label} (${executable.path}): ${errorMessage(error)}`)
    }
  }

  const candidates = platformBrowserCandidates()
  const installed = candidates.filter(
    (candidate, index) =>
      candidates.findIndex((other) => other.path === candidate.path) === index && fs.existsSync(candidate.path),
  )
  if (!installed.length) {
    const looked = candidates.map((c) => `  ${c.label}: ${c.path}`).join('\n')
    throw new Error(
      `No Chromium-based browser found. Looked for:\n${looked}\n` +
        'Install Chrome or Edge, or pass --browser <path-to-executable>.',
    )
  }
  return startFirstBrowser(installed, startBrowser)
}

/**
 * Try `start` on each candidate in order and return the first browser that
 * comes up. When none does, the error lists every candidate and why it failed.
 */
export async function startFirstBrowser<T>(
  candidates: BrowserExecutable[],
  start: (candidate: BrowserExecutable) => Promise<T>,
): Promise<T> {
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      return await start(candidate)
    } catch (error) {
      failures.push(`  ${candidate.label} (${candidate.path}): ${errorMessage(error)}`)
    }
  }
  throw new Error(
    `No browser could be started. Tried:\n${failures.join('\n')}\n` +
      'Pass --browser <path-to-executable> to use another Chromium-based browser.',
  )
}

/**
 * Spawn one browser on a fresh temporary profile and connect to it. When it
 * does not come up (exits early, never prints its endpoint, refuses the
 * connection), everything it started is ended and the profile removed before
 * the error is rethrown.
 */
export async function startBrowser(executable: BrowserExecutable): Promise<LaunchedBrowser> {
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
    { stdio: ['ignore', 'ignore', 'pipe'], env: browserEnv() },
  )

  let client: CdpClient
  try {
    const endpoint = await waitForDevtoolsEndpoint(child, STARTUP_TIMEOUT)
    client = await CdpClient.connect(endpoint)
  } catch (error) {
    await killBrowserTree(child, userDataDir)
    await removeProfile(userDataDir)
    throw error
  }

  return {
    client,
    close: async () => {
      await client.send('Browser.close').catch(() => {})
      client.dispose()
      await stopProcess(child)
      await removeProfile(userDataDir)
    },
  }
}

/**
 * The environment a browser starts with. On Windows it leaves out
 * `__COMPAT_LAYER` (Git Bash and some tool runners set it to `RunAsInvoker`):
 * under a compatibility layer Edge relaunches itself without it and exits at
 * once, so the process we spawned never prints its endpoint while the
 * relaunched one keeps running.
 */
export function browserEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  if (platform !== 'win32') return env
  const result = { ...env }
  for (const key of Object.keys(result)) {
    if (key.toUpperCase() === '__COMPAT_LAYER') delete result[key]
  }
  return result
}

/**
 * The Windows commands that end a browser which failed to start, best effort:
 * `taskkill /T /F` on its process tree while the spawned process still runs
 * (`pid`), then — because a browser that relaunched itself has outlived the
 * process we spawned — every process still running on its temporary profile,
 * found by the profile's folder name in the command line.
 */
export function windowsKillCommands(pid: number | undefined, userDataDir: string): Array<[string, string[]]> {
  const commands: Array<[string, string[]]> = []
  if (pid) commands.push(['taskkill.exe', ['/T', '/F', '/PID', String(pid)]])
  const profile = win32.basename(userDataDir)
  // The name goes into a WQL LIKE pattern: only plain mkdtemp names qualify.
  if (/^[\w.-]+$/.test(profile)) {
    const script =
      `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%${profile}%'" | ` +
      'Where-Object { $_.ProcessId -ne $PID } | ' +
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
    // An encoded command keeps the quotes intact and the profile name out of
    // PowerShell's own command line.
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    commands.push(['powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]])
  }
  return commands
}

/** End a browser that failed to start, with every process it spawned (best effort). */
async function killBrowserTree(child: ChildProcess, userDataDir: string): Promise<void> {
  if (process.platform === 'win32') {
    for (const [command, args] of windowsKillCommands(isRunning(child) ? child.pid : undefined, userDataDir)) {
      await runQuietly(command, args)
    }
  }
  await stopProcess(child)
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

/** Kill the spawned process (if it still runs) and wait up to 3 s for it to exit. */
async function stopProcess(child: ChildProcess): Promise<void> {
  if (!isRunning(child)) return
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    setTimeout(resolve, 3000)
  })
  child.kill()
  await exited
}

/** Remove a temporary profile; it can stay locked for a moment after exit on Windows. */
async function removeProfile(userDataDir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
}

/** Run a command, ignoring its output and any failure. */
function runQuietly(command: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 15_000, windowsHide: true }, () => resolve())
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Read the spawned browser's stderr until it prints its DevTools WebSocket URL. */
function waitForDevtoolsEndpoint(child: ChildProcess, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(
      () => reject(new Error(`no DevTools endpoint within ${timeout}ms`)),
      timeout,
    )
    let found = false
    // Keeps draining stderr after the endpoint is found (a full pipe would
    // block the browser), without keeping what it says.
    child.stderr!.on('data', (chunk: Buffer) => {
      if (found) return
      buffer += chunk.toString()
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        found = true
        clearTimeout(timer)
        resolve(match[1]!)
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      // The last thing it said is usually why (a bad flag, a missing library).
      const said = buffer.trim().split(/\r?\n/).pop()?.trim().slice(0, 200)
      reject(new Error(`browser exited early (${code !== null ? `code ${code}` : signal})${said ? `: ${said}` : ''}`))
    })
  })
}

/**
 * Known install locations of Chromium-based browsers, in the order they are
 * tried. On Windows Chrome comes first: Edge ships with Windows, so it is the
 * fallback, and it relaunches itself under a compatibility layer (see
 * {@link browserEnv}).
 */
export function platformBrowserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): BrowserExecutable[] {
  if (platform === 'win32') {
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files'
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
    const localAppData = env['LOCALAPPDATA'] ?? win32.join(home, 'AppData', 'Local')
    const chrome = ['Google', 'Chrome', 'Application', 'chrome.exe']
    const edge = ['Microsoft', 'Edge', 'Application', 'msedge.exe']
    return [
      { label: 'Google Chrome', path: win32.join(programFiles, ...chrome) },
      { label: 'Google Chrome', path: win32.join(programFilesX86, ...chrome) },
      { label: 'Google Chrome', path: win32.join(localAppData, ...chrome) },
      { label: 'Microsoft Edge', path: win32.join(programFilesX86, ...edge) },
      { label: 'Microsoft Edge', path: win32.join(programFiles, ...edge) },
    ]
  }
  if (platform === 'darwin') {
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
