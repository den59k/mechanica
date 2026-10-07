import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { clearPendingLogin, getPendingLogin, getToken, savePendingLogin, type PendingLogin } from '@/cli/platform/credentials'
import { checkDeviceLogin, describeDeviceLogin, requireToken, startDeviceLogin } from '@/cli/platform/session'
import { runLogin } from '@/cli/platform/login'

/*
 * Signing in from the browser, on the CLI's side: a started request is kept, the next command
 * finishes the sign-in once the link was approved, and a denied or expired one is reported —
 * never restarted on its own.
 */

const ORIGIN = 'https://platform.test'
let dir: string
let calls: { method: string; path: string; body?: any; auth?: string | null }[]

/** A fake platform: `answers` maps "METHOD /path" to a status + JSON body (or a function of the request). */
function fakePlatform(answers: Record<string, { status?: number; body?: unknown } | ((body: any) => { status?: number; body?: unknown })>) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const { pathname } = new URL(url)
    const method = init.method ?? 'GET'
    const headers = init.headers as Record<string, string>
    const body = init.body ? JSON.parse(init.body as string) : undefined
    calls.push({ method, path: pathname, body, auth: headers?.authorization ?? null })
    const found = answers[`${method} ${pathname}`]
    const answer = typeof found === 'function' ? found(body) : found
    if (!answer) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(answer.body ?? null), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

const pending = (over: Partial<PendingLogin> = {}): PendingLogin => ({
  deviceCode: 'd'.repeat(48),
  userCode: 'kq7f2mdx',
  verificationUrl: `${ORIGIN}/device/kq7f2mdx`,
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  interval: 3,
  ...over,
})

beforeEach(async () => {
  dir = await mkdtemp(join(os.tmpdir(), 'mech-device-'))
  process.env.MECHANICA_CONFIG_DIR = dir
  delete process.env.MECHANICA_TOKEN
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
  delete process.env.MECHANICA_CONFIG_DIR
})

describe('pending logins', () => {
  it('are kept per origin in the config folder, readable by the user alone, and cleared one at a time', async () => {
    await savePendingLogin(ORIGIN, pending())
    await savePendingLogin('https://other.test', pending({ userCode: 'other' }))
    expect((await getPendingLogin(ORIGIN))?.userCode).toBe('kq7f2mdx')
    const file = join(dir, 'pending-logins.json')
    expect(JSON.parse(await readFile(file, 'utf-8'))).toHaveProperty([ORIGIN, 'deviceCode'])
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)

    await clearPendingLogin(ORIGIN)
    expect(await getPendingLogin(ORIGIN)).toBeNull()
    expect((await getPendingLogin('https://other.test'))?.userCode).toBe('other')
    await clearPendingLogin('https://other.test')
    await expect(stat(file)).rejects.toThrow()
    await expect(clearPendingLogin(ORIGIN)).resolves.toBeUndefined()
  })
})

describe('starting a sign-in', () => {
  it('asks the platform for a request named after this machine, keeps it, and describes the link', async () => {
    fakePlatform({
      'POST /api/account/device': {
        body: { deviceCode: 'x'.repeat(48), userCode: 'abcd1234', verificationUrl: `${ORIGIN}/device/abcd1234`, expiresAt: new Date(Date.now() + 600_000).toISOString(), interval: 3 },
      },
    })
    const started = await startDeviceLogin(ORIGIN)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/account/device', auth: null })
    expect(calls[0]!.body.name).toMatch(/^CLI on .+/)
    expect(started.verificationUrl).toBe(`${ORIGIN}/device/abcd1234`)
    expect(await getPendingLogin(ORIGIN)).toEqual(started)

    const text = describeDeviceLogin(ORIGIN, started)
    expect(text).toContain(`${ORIGIN}/device/abcd1234`)
    expect(text).toMatch(/valid for 10 minutes/)
  })

  it('runLogin without a terminal prints the link and returns, leaving the request for the next command', async () => {
    fakePlatform({
      'POST /api/account/device': {
        body: { deviceCode: 'x'.repeat(48), userCode: 'abcd1234', verificationUrl: `${ORIGIN}/device/abcd1234`, expiresAt: new Date(Date.now() + 600_000).toISOString() },
      },
    })
    await runLogin({ host: ORIGIN, wait: false })
    const printed = (console.info as any).mock.calls.map((call: unknown[]) => call.join(' ')).join('\n')
    expect(printed).toContain(`${ORIGIN}/device/abcd1234`)
    expect(printed).toMatch(/next command finishes the sign-in/)
    expect(await getPendingLogin(ORIGIN)).not.toBeNull()
    expect(await getToken(ORIGIN)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('runLogin --token stores a working token and starts nothing', async () => {
    fakePlatform({ 'GET /api/account': { body: { email: 'den@test.io' } } })
    await runLogin({ host: ORIGIN, token: 'mch_given' })
    expect(await getToken(ORIGIN)).toBe('mch_given')
    expect(calls).toEqual([{ method: 'GET', path: '/api/account', body: undefined, auth: 'Bearer mch_given' }])
  })
})

describe('requireToken', () => {
  it('hands back a saved token without asking the platform', async () => {
    fakePlatform({})
    process.env.MECHANICA_TOKEN = 'mch_env'
    expect(await requireToken(ORIGIN)).toBe('mch_env')
    expect(calls).toEqual([])
  })

  it('says to run login when nothing was started', async () => {
    fakePlatform({})
    await expect(requireToken(ORIGIN)).rejects.toThrow(/run `mechanica login` first/)
  })

  it('while the link waits: says to approve it, and keeps the request', async () => {
    fakePlatform({ 'POST /api/account/device/token': { body: { status: 'pending', interval: 3 } } })
    await savePendingLogin(ORIGIN, pending())
    await expect(requireToken(ORIGIN)).rejects.toThrow(/open https:\/\/platform\.test\/device\/kq7f2mdx and approve/)
    expect(calls[0]!.body).toEqual({ deviceCode: 'd'.repeat(48) })
    expect(await getPendingLogin(ORIGIN)).not.toBeNull()
  })

  it('once approved: collects the token, saves it, forgets the request — and the next call needs no platform', async () => {
    fakePlatform({
      'POST /api/account/device/token': { body: { status: 'approved', token: 'mch_collected' } },
      'GET /api/account': { body: { email: 'den@test.io' } },
    })
    await savePendingLogin(ORIGIN, pending())
    expect(await requireToken(ORIGIN)).toBe('mch_collected')
    expect(await getToken(ORIGIN)).toBe('mch_collected')
    expect(await getPendingLogin(ORIGIN)).toBeNull()
    expect(calls.map((call) => call.path)).toEqual(['/api/account/device/token', '/api/account'])
    expect(calls[1]!.auth).toBe('Bearer mch_collected')

    calls = []
    expect(await requireToken(ORIGIN)).toBe('mch_collected')
    expect(calls).toEqual([])
  })

  it('denied: forgets the request and says so, without starting another', async () => {
    fakePlatform({ 'POST /api/account/device/token': { body: { status: 'denied' } } })
    await savePendingLogin(ORIGIN, pending())
    await expect(requireToken(ORIGIN)).rejects.toThrow(/denied in the browser.*mechanica login/)
    expect(await getPendingLogin(ORIGIN)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('expired (the platform forgot it): forgets the request and says so, without starting another', async () => {
    fakePlatform({ 'POST /api/account/device/token': { status: 404, body: 'This sign-in request does not exist or has expired' } })
    await savePendingLogin(ORIGIN, pending())
    await expect(requireToken(ORIGIN)).rejects.toThrow(/link .* has expired.*mechanica login/)
    expect(await getPendingLogin(ORIGIN)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('an unreachable platform is reported as such, and the request is kept', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED')
    })
    await savePendingLogin(ORIGIN, pending())
    await expect(requireToken(ORIGIN)).rejects.toThrow(/Could not reach/)
    expect(await getPendingLogin(ORIGIN)).not.toBeNull()
  })
})

describe('checkDeviceLogin', () => {
  it('maps the platform answers to outcomes', async () => {
    const answers: Record<string, { status?: number; body?: unknown }> = {}
    fakePlatform({ 'POST /api/account/device/token': () => answers.now! })
    answers.now = { body: { status: 'pending', interval: 3 } }
    expect(await checkDeviceLogin(ORIGIN, pending())).toEqual({ status: 'pending' })
    answers.now = { body: { status: 'approved', token: 'mch_t' } }
    expect(await checkDeviceLogin(ORIGIN, pending())).toEqual({ status: 'approved', token: 'mch_t' })
    answers.now = { body: { status: 'denied' } }
    expect(await checkDeviceLogin(ORIGIN, pending())).toEqual({ status: 'denied' })
    answers.now = { status: 404, body: 'gone' }
    expect(await checkDeviceLogin(ORIGIN, pending())).toEqual({ status: 'expired' })
    answers.now = { status: 500, body: 'boom' }
    await expect(checkDeviceLogin(ORIGIN, pending())).rejects.toThrow(/boom/)
  })
})
