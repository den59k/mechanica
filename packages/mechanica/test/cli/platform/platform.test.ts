import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { BUNDLE_MAGIC, encodeBundle, listBundleFiles, packBundle } from '@/cli/platform/bundle-format'
import { parseRemoteUrl } from '@/cli/platform/api'
import { getToken, hostOrigin, saveToken } from '@/cli/platform/credentials'
import { gitAuthEnv } from '@/cli/platform/git'
import { engineVersion } from '@/cli/platform/engine-version'
import { branchProblem } from '@/cli/platform/push'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(os.tmpdir(), 'mech-platform-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  delete process.env.MECHANICA_CONFIG_DIR
  delete process.env.MECHANICA_TOKEN
  delete process.env.MECHANICA_HOST
})

/** Decode a bundle body the way the platform does. */
function decode(body: Uint8Array) {
  const magic = new TextDecoder().decode(body.subarray(0, 4))
  const headerLength = new DataView(body.buffer, body.byteOffset).getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(body.subarray(8, 8 + headerLength)))
  let offset = 8 + headerLength
  const files: Record<string, string> = {}
  for (const file of header.files) {
    files[file.path] = new TextDecoder().decode(body.subarray(offset, offset + file.size))
    offset += file.size
  }
  return { magic, header, files, consumed: offset }
}

describe('bundle format', () => {
  it('packs dist/ with forward-slashed, sorted paths and exact sizes', async () => {
    await mkdir(join(dir, 'assets/nested'), { recursive: true })
    await mkdir(join(dir, '.vite'), { recursive: true })
    await writeFile(join(dir, 'ssr.js'), 'export {}')
    await writeFile(join(dir, 'index.html'), '<html>привет</html>')
    await writeFile(join(dir, 'assets/nested/app.js'), 'console.log(1)')
    await writeFile(join(dir, '.vite/manifest.json'), '{}')
    await writeFile(join(dir, 'empty.txt'), '')

    expect(await listBundleFiles(dir)).toEqual([
      '.vite/manifest.json',
      'assets/nested/app.js',
      'empty.txt',
      'index.html',
      'ssr.js',
    ])

    const commit = 'c'.repeat(40)
    const body = await packBundle(dir, { commit, engine: '2.1.0' })
    const { magic, header, files, consumed } = decode(body)

    expect(magic).toBe(BUNDLE_MAGIC)
    expect(header).toMatchObject({ format: 1, commit, engine: '2.1.0' })
    expect(consumed).toBe(body.length)
    expect(files['index.html']).toBe('<html>привет</html>')
    expect(files['assets/nested/app.js']).toBe('console.log(1)')
    expect(files['empty.txt']).toBe('')
    // Sizes are bytes, not characters.
    expect(header.files.find((f: any) => f.path === 'index.html').size).toBe(Buffer.byteLength('<html>привет</html>'))
  })

  it('encodes binary data untouched', () => {
    const data = new Uint8Array([0, 255, 10, 13, 0, 128])
    const body = encodeBundle({ commit: 'd'.repeat(40), engine: '2.0.0' }, [{ path: 'a.bin', data }])
    expect(Array.from(body.subarray(body.length - data.length))).toEqual(Array.from(data))
  })
})

describe('platform link', () => {
  it('reads the origin and slug off a site remote URL', () => {
    expect(parseRemoteUrl('https://mechanica.jt3.ru/git/my-site.git')).toEqual({
      origin: 'https://mechanica.jt3.ru',
      slug: 'my-site',
    })
    expect(parseRemoteUrl('http://localhost:3000/git/abc.git/')).toEqual({ origin: 'http://localhost:3000', slug: 'abc' })
  })

  it('rejects remotes that are not a Mechanica site', () => {
    for (const url of [
      'git@github.com:den59k/mechanica.git',
      'https://github.com/den59k/mechanica.git',
      'https://mechanica.jt3.ru/git/a/b.git',
      'https://mechanica.jt3.ru/git/My_Site.git',
      'ftp://mechanica.jt3.ru/git/site.git',
      'not a url',
    ]) {
      expect(parseRemoteUrl(url)).toBeNull()
    }
  })

  it('normalizes hosts to an origin', () => {
    expect(hostOrigin('mechanica.example.com')).toBe('https://mechanica.example.com')
    expect(hostOrigin('http://localhost:3000/some/path')).toBe('http://localhost:3000')
    expect(hostOrigin(undefined)).toBe('https://mechanica.jt3.ru')
    process.env.MECHANICA_HOST = 'http://127.0.0.1:3000'
    expect(hostOrigin(undefined)).toBe('http://127.0.0.1:3000')
  })
})

describe('credentials', () => {
  it('keeps one token per origin; MECHANICA_TOKEN overrides', async () => {
    process.env.MECHANICA_CONFIG_DIR = dir
    expect(await getToken('https://a.example')).toBeNull()

    const file = await saveToken('https://a.example', 'mch_aaa')
    await saveToken('https://b.example', 'mch_bbb')
    expect(file).toBe(join(dir, 'credentials.json'))
    expect(await getToken('https://a.example')).toBe('mch_aaa')
    expect(await getToken('https://b.example')).toBe('mch_bbb')
    expect(JSON.parse(await readFile(file, 'utf-8'))).toEqual({
      'https://a.example': 'mch_aaa',
      'https://b.example': 'mch_bbb',
    })

    process.env.MECHANICA_TOKEN = 'mch_ci'
    expect(await getToken('https://a.example')).toBe('mch_ci')
  })

  it('scopes the git credential to the platform origin and keeps it off argv', () => {
    const env = gitAuthEnv('https://mechanica.jt3.ru', 'mch_secret')
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://mechanica.jt3.ru/.extraHeader')
    expect(Buffer.from(env.GIT_CONFIG_VALUE_0!.replace('Authorization: Basic ', ''), 'base64').toString()).toBe(
      'mechanica:mch_secret',
    )
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })
})

describe('engine version', () => {
  it('reads the version of this package', () => {
    expect(engineVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('the branch a push sends', () => {
  it('goes under its own name when the name can be part of an address', () => {
    for (const name of ['main', 'master', 'new-menu', 'v2', 'a']) expect(branchProblem(name), name).toBeNull()
    for (const name of ['feature/menu', 'Menu', 'new_menu', 'edit', 'double--hyphen', '-lead', 'trail-', 'x'.repeat(41)]) {
      expect(branchProblem(name), name).toContain('git branch -m')
    }
  })
})
