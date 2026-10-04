import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { execFileSync } from 'node:child_process'
import {
  pushUploads,
  remoteAssetsFor,
  resolveLink,
  runAssetsPull,
  uploadsIgnored,
  type SiteLink,
} from '@/cli/platform/assets'
import { ignoreUploads } from '@/cli/platform/link'

// A linked project and a stand-in for the platform's uploads API.
let cwd: string
let server: Server
let origin: string
/** What the platform's store holds: name → bytes, and image info by name. */
let store: Map<string, Buffer>
let info: Record<string, Record<string, unknown>>
let requests: string[]

const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' },
    stdio: 'pipe',
  }).toString()

const write = (file: string, content: string) => {
  fs.mkdirSync(join(cwd, file, '..'), { recursive: true })
  fs.writeFileSync(join(cwd, file), content)
}

beforeEach(async () => {
  store = new Map()
  info = {}
  requests = []
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://platform')
    requests.push(`${req.method} ${url.pathname}${url.search}`)
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (req.headers.authorization !== 'Bearer mch_test') return send(403, 'Access token is not valid')
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const name = url.searchParams.get('name') ?? ''
      if (url.pathname === '/api/sites') return send(200, [{ uuid: 'u1', slug: 'acme', name: 'Acme', role: 'owner', gitUrl: '' }])
      if (url.pathname === '/api/sites/u1/assets' && req.method === 'GET') {
        return send(200, [...store].map(([key, data]) => ({ name: key, size: data.length, hash: 'h', ...info[key] })))
      }
      if (url.pathname === '/api/sites/u1/assets/file' && req.method === 'GET') {
        const data = store.get(name)
        return data ? res.writeHead(200).end(data) : send(404, 'No such upload')
      }
      if (url.pathname === '/api/sites/u1/assets/file' && req.method === 'POST') {
        store.set(name, body)
        return send(200, { name, stored: true })
      }
      if (url.pathname === '/api/sites/u1/assets/info' && req.method === 'POST') {
        Object.assign(info, JSON.parse(body.toString()))
        return send(200, null)
      }
      send(404, 'Not found')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  origin = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`

  cwd = fs.mkdtempSync(join(os.tmpdir(), 'mech-uploads-'))
  git('init', '--quiet', '--initial-branch=main')
  git('remote', 'add', 'mechanica', `${origin}/git/acme.git`)
  vi.stubEnv('MECHANICA_TOKEN', 'mch_test')
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  fs.rmSync(cwd, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const link = async () => (await resolveLink(cwd)) as SiteLink

describe('resolveLink', () => {
  it('finds the site behind the mechanica remote', async () => {
    expect(await resolveLink(cwd)).toEqual({ origin, slug: 'acme', uuid: 'u1', token: 'mch_test' })
  })

  it('is null — not an error — for a project that is not linked, not logged in or offline', async () => {
    git('remote', 'remove', 'mechanica')
    expect(await resolveLink(cwd)).toBeNull()

    git('remote', 'add', 'mechanica', 'http://localhost:1/git/acme.git')
    expect(await resolveLink(cwd)).toBeNull()

    git('remote', 'set-url', 'mechanica', `${origin}/git/acme.git`)
    vi.stubEnv('MECHANICA_TOKEN', 'mch_wrong')
    expect(await resolveLink(cwd)).toBeNull()
  })
})

describe('pushUploads', () => {
  it('sends the uploads git does not carry and the platform lacks, with their image info', async () => {
    write('.mech/assets/committed.png', 'COMMITTED')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'Site')
    write('.gitignore', '.mech/assets/\n.mech/images.json\n')
    write('.mech/assets/new-0a1b2c3d.png', 'NEW')
    write('.mech/assets/there-0a1b2c3d.png', 'THERE')
    write('.mech/images.json', JSON.stringify({ 'new-0a1b2c3d.png': { width: 8, height: 6, previewSrc: 'data:image/webp;base64,x' }, 'there-0a1b2c3d.png': { width: 1, height: 1 } }))
    store.set('there-0a1b2c3d.png', Buffer.from('THERE'))

    const sent = await pushUploads(cwd, await link(), () => {})

    expect(sent).toEqual(['new-0a1b2c3d.png'])
    expect(store.get('new-0a1b2c3d.png')!.toString()).toBe('NEW')
    // Committed uploads travel with git; an upload the platform has is not sent again.
    expect(store.has('committed.png')).toBe(false)
    expect(requests.filter((request) => request.startsWith('POST /api/sites/u1/assets/file'))).toHaveLength(1)
    expect(info).toEqual({ 'new-0a1b2c3d.png': { width: 8, height: 6, previewSrc: 'data:image/webp;base64,x' } })
  })

  it('asks the platform nothing when there is nothing it could lack', async () => {
    write('.mech/assets/committed.png', 'COMMITTED')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'Site')
    const before = requests.length
    expect(await pushUploads(cwd, { origin, slug: 'acme', uuid: 'u1', token: 'mch_test' }, () => {})).toEqual([])
    expect(requests.length).toBe(before)
  })
})

describe('mechanica assets pull', () => {
  it('downloads what the platform has and the project lacks, with its image info', async () => {
    store.set('online-0a1b2c3d.png', Buffer.from('ONLINE'))
    store.set('here-0a1b2c3d.png', Buffer.from('HERE'))
    info['online-0a1b2c3d.png'] = { width: 30, height: 20, previewSrc: 'data:image/webp;base64,p' }
    write('.mech/assets/here-0a1b2c3d.png', 'HERE')

    expect(await runAssetsPull({ cwd })).toEqual(['online-0a1b2c3d.png'])
    expect(fs.readFileSync(join(cwd, '.mech/assets/online-0a1b2c3d.png'), 'utf-8')).toBe('ONLINE')
    expect(JSON.parse(fs.readFileSync(join(cwd, '.mech/images.json'), 'utf-8'))).toEqual({
      'online-0a1b2c3d.png': { width: 30, height: 20, previewSrc: 'data:image/webp;base64,p' },
    })
    expect(await runAssetsPull({ cwd })).toEqual([])
  })

  it('refuses a name that is a path, whatever the platform says', async () => {
    store.set('../../escape.txt', Buffer.from('X'))
    expect(await runAssetsPull({ cwd })).toEqual([])
    expect(fs.existsSync(join(cwd, '..', 'escape.txt'))).toBe(false)
  })

  it('says so when the project is not linked', async () => {
    git('remote', 'remove', 'mechanica')
    await expect(runAssetsPull({ cwd })).rejects.toThrow(/not linked/)
  })
})

describe('the dev server and the platform', () => {
  it('fetches an upload made online, with its info, and lists what is there', async () => {
    store.set('online-0a1b2c3d.png', Buffer.from('ONLINE'))
    info['online-0a1b2c3d.png'] = { width: 30, height: 20 }
    const remote = remoteAssetsFor(cwd)

    const fetched = await remote.fetch('online-0a1b2c3d.png')
    expect(Buffer.from(fetched!.data).toString()).toBe('ONLINE')
    expect(fetched!.info).toEqual({ width: 30, height: 20 })
    expect(await remote.fetch('missing.png')).toBeNull()
    expect(await remote.list()).toEqual(['online-0a1b2c3d.png'])
  })

  it('has nothing, quietly, for a project that is not linked', async () => {
    git('remote', 'remove', 'mechanica')
    const remote = remoteAssetsFor(cwd)
    expect(await remote.fetch('online-0a1b2c3d.png')).toBeNull()
    expect(await remote.list()).toEqual([])
    expect(requests).toEqual([])
  })
})

describe('keeping uploads out of git', () => {
  it('mechanica link makes git ignore the uploads directory, once', async () => {
    expect(await uploadsIgnored(cwd)).toBe(false)
    write('.gitignore', 'node_modules/\ndist/')

    await ignoreUploads(cwd)
    const ignore = fs.readFileSync(join(cwd, '.gitignore'), 'utf-8')
    expect(ignore.startsWith('node_modules/\ndist/\n')).toBe(true)
    expect(ignore).toContain('.mech/assets/\n.mech/images.json\n')
    expect(await uploadsIgnored(cwd)).toBe(true)

    await ignoreUploads(cwd)
    expect(fs.readFileSync(join(cwd, '.gitignore'), 'utf-8')).toBe(ignore)
  })

  it('tells how to move uploads that are already committed', async () => {
    write('.mech/assets/committed.png', 'COMMITTED')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'Site')
    const said: string[] = []
    vi.mocked(console.info).mockImplementation((message) => void said.push(String(message)))

    await ignoreUploads(cwd)
    expect(said.some((line) => line.includes('git rm -r --cached .mech/assets'))).toBe(true)
    // Still tracked: nothing was removed for the developer.
    expect(git('ls-files', '.mech/assets').trim()).toBe('.mech/assets/committed.png')
  })
})
