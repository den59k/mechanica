import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  createEditorService,
  fsContentFiles,
  memoryContentFiles,
  pageOfFile,
  type ContentFiles,
  type SiteManifest,
} from '@/server'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(os.tmpdir(), 'mech-files-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** Every file under a directory as `path → text`, the way `memoryContentFiles` takes them. */
const dump = (root: string): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const full = join(entry.parentPath, entry.name)
    out[full.slice(root.length + 1).replace(/\\/g, '/')] = fs.readFileSync(full, 'utf-8')
  }
  return out
}

const snapshot = (files: ContentFiles): Record<string, string> =>
  Object.fromEntries(
    files
      .list('')
      .sort()
      .map((path) => [path, files.read(path)!]),
  )

// The same behavior from both implementations: the stores cannot tell them apart.
describe.each([
  ['on disk', () => fsContentFiles(dir)],
  ['in memory', () => memoryContentFiles({})],
])('content files %s', (_name, create) => {
  let files: ContentFiles
  beforeEach(() => {
    files = create()
  })

  it('reads back what was written and reports what is missing', () => {
    expect(files.read('data.json')).toBeNull()
    expect(files.has('data.json')).toBe(false)

    files.write('data.json', '{"a":1}')
    files.write('pages/blog/post.page.md', 'post')

    expect(files.read('data.json')).toBe('{"a":1}')
    expect(files.has('pages/blog/post.page.md')).toBe(true)
    // A directory is not a file.
    expect(files.has('pages/blog')).toBe(false)
    expect(files.read('pages/blog')).toBeNull()
  })

  it('lists files at any depth and directories one level down', () => {
    files.write('pages/index.page.md', '')
    files.write('pages/blog/index.page.md', '')
    files.write('pages/blog/2024/post.page.md', '')
    files.write('data.json', '{}')

    expect(files.list('pages').sort()).toEqual([
      'pages/blog/2024/post.page.md',
      'pages/blog/index.page.md',
      'pages/index.page.md',
    ])
    expect(files.list('pages/blog').sort()).toEqual(['pages/blog/2024/post.page.md', 'pages/blog/index.page.md'])
    expect(files.list('nowhere')).toEqual([])
    expect(files.dirs('pages')).toEqual(['blog'])
    expect(files.dirs('pages/blog')).toEqual(['2024'])
    expect(files.isDir('pages/blog')).toBe(true)
    expect(files.isDir('pages/index.page.md')).toBe(false)
    expect(files.isDir('pages/blo')).toBe(false)
  })

  it('removes a file, and a nested folder with its last file', () => {
    files.write('pages/blog/post.page.md', 'post')
    files.write('pages/index.page.md', '')

    expect(files.remove('pages/blog/post.page.md')).toBe(true)
    expect(files.remove('pages/blog/post.page.md')).toBe(false)
    expect(files.isDir('pages/blog')).toBe(false)
    expect(files.dirs('pages')).toEqual([])
  })

  it('renames a file, replacing the target', () => {
    files.write('pages/old/a.page.md', 'A')
    files.write('pages/b.page.md', 'B')

    files.rename('pages/old/a.page.md', 'pages/b.page.md')

    expect(files.read('pages/b.page.md')).toBe('A')
    expect(files.has('pages/old/a.page.md')).toBe(false)
    expect(files.isDir('pages/old')).toBe(false)
  })
})

describe('memoryContentFiles().changes()', () => {
  it('is empty when nothing changed, and when a change was undone', () => {
    const files = memoryContentFiles({ 'data.json': '{}', 'pages/a.page.md': 'A' })
    files.write('data.json', '{"x":1}')
    files.write('data.json', '{}')
    files.write('pages/new.page.md', 'N')
    files.remove('pages/new.page.md')

    const { written, removed, moved } = files.changes()
    expect([...written]).toEqual([])
    expect(removed).toEqual([])
    expect([...moved]).toEqual([])
  })

  it('reports written, removed and moved files against the starting set', () => {
    const files = memoryContentFiles(
      new Map([
        ['data.json', '{}'],
        ['pages/a.page.md', 'A'],
        ['pages/gone.page.md', 'G'],
      ]),
    )
    files.write('data.json', '{"x":1}')
    files.write('pages/new.page.md', 'N')
    files.remove('pages/gone.page.md')
    files.rename('pages/a.page.md', 'pages/tmp.page.md')
    files.rename('pages/tmp.page.md', 'pages/b.page.md')
    files.write('pages/b.page.md', 'A2')

    const { written, removed, moved } = files.changes()
    expect(Object.fromEntries(written)).toEqual({
      'data.json': '{"x":1}',
      'pages/new.page.md': 'N',
      'pages/b.page.md': 'A2',
    })
    expect(removed.sort()).toEqual(['pages/a.page.md', 'pages/gone.page.md'])
    // Two renames in a row are one move from where the file started.
    expect(Object.fromEntries(moved)).toEqual({ 'pages/b.page.md': 'pages/a.page.md' })
  })

  it('forgets a move when the file went back or the old place was taken again', () => {
    const back = memoryContentFiles({ 'pages/a.page.md': 'A' })
    back.rename('pages/a.page.md', 'pages/b.page.md')
    back.rename('pages/b.page.md', 'pages/a.page.md')
    expect([...back.changes().moved]).toEqual([])
    expect([...back.changes().written]).toEqual([])

    const retaken = memoryContentFiles({ 'pages/a.page.md': 'A' })
    retaken.rename('pages/a.page.md', 'pages/b.page.md')
    retaken.write('pages/a.page.md', 'another')
    expect([...retaken.changes().moved]).toEqual([])
  })
})

describe('pageOfFile', () => {
  it('names the logical page and the locale of a content file', () => {
    expect(pageOfFile('pages/index.page.md')).toEqual({ path: '/' })
    expect(pageOfFile('pages/about.page.md')).toEqual({ path: '/about' })
    expect(pageOfFile('pages/blog/index@ru.page.md')).toEqual({ path: '/blog', locale: 'ru' })
    expect(pageOfFile('pages/blog/post@de.page.md')).toEqual({ path: '/blog/post', locale: 'de' })
    expect(pageOfFile('data.json')).toBeNull()
    expect(pageOfFile('pages/notes.md')).toBeNull()
  })
})

// The point of the seam: the editor API over files in memory behaves exactly
// like the one over a directory — same answers, same resulting files.
describe('the editor service over memory files matches the one over a directory', () => {
  const site: SiteManifest = {
    format: 1,
    blocks: [
      {
        id: 'hero',
        name: 'Hero',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string', default: 'Untitled' },
            body: { type: 'array', format: 'richText', items: { type: 'object' } },
          },
          required: ['title'],
        },
      } as never,
    ],
    locales: { default: 'en', all: ['en', 'ru'] },
    generated: [],
  }

  const seed: Record<string, string> = {
    'pages/index.page.md': '---\nname: Home\n---\n\n::: hero #h1\ntitle: Welcome\n:::\n',
    'pages/about.page.md': '---\nname: About\n---\n\n::: hero #h2\ntitle: About us\n:::\n',
    'pages/about@ru.page.md': '---\nname: About\n---\n\n::: hero #h2\ntitle: О нас\n:::\n',
    'pages/blog/index.page.md': '---\nname: Blog\n---\n',
    'pages/blog/first.page.md': '---\nname: First\n---\n\n::: hero #h3\n:::\n',
    'data.json': '{\n  "header": {\n    "phone": "1"\n  }\n}',
    'folders.json': '{\n  "blog": {\n    "tag": "news"\n  }\n}',
  }

  /** Run the same requests against both services and collect what they answered. */
  const run = async (steps: [string, RequestInit?][]) => {
    for (const [path, text] of Object.entries(seed)) {
      fs.mkdirSync(join(dir, path, '..'), { recursive: true })
      fs.writeFileSync(join(dir, path), text)
    }
    const memory = memoryContentFiles(seed)
    const onDisk = createEditorService(dir, { site })
    const inMemory = createEditorService(memory, { site })

    const answers: { disk: unknown[]; memory: unknown[] } = { disk: [], memory: [] }
    for (const [path, init] of steps) {
      for (const [service, into] of [
        [onDisk, answers.disk],
        [inMemory, answers.memory],
      ] as const) {
        const response = await service.handle(new Request(`http://host${path}`, init))
        into.push([response!.status, await response!.json()])
      }
    }
    return { answers, memory }
  }

  const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

  it('reads: states, lists, folders, queries', async () => {
    const { answers, memory } = await run([
      ['/pages'],
      ['/folders'],
      ['/state?path=/'],
      ['/state?path=/about'],
      ['/state?path=/ru/about'],
      ['/state?path=/ru/blog'],
      ['/state?path=/blog/first'],
      ['/state?path=/missing'],
      [`/query?q=${encodeURIComponent('getPages.' + JSON.stringify({ folderName: 'blog' }))}`],
      ['/composed'],
    ])
    expect(answers.memory).toEqual(answers.disk)
    // Reading changes nothing.
    expect([...memory.changes().written]).toEqual([])
    expect((answers.disk[0] as [number, { path: string }[]])[1].map((page) => page.path)).toEqual([
      '/',
      '/about',
      '/blog',
      '/blog/first',
    ])
  })

  it('writes: the same answers and the same files afterwards', async () => {
    const { answers, memory } = await run([
      ['/pages', post({ path: '/contact', name: 'Contact' })],
      ['/pages', post({ path: '/about', name: 'Taken' })],
      [
        '/save?path=/contact',
        post({
          content: [{ id: 'c1', blockId: 'hero', data: { title: 'Write to us' } }],
          pageData: { head: { title: 'Contact' } },
          siteData: { header: { phone: '2' } },
        }),
      ],
      ['/save?path=/blog/first', post({ content: [], pageData: {}, folderData: { tag: 'updates' } })],
      [
        '/save?path=/about&locale=ru',
        post({ content: [{ id: 'h2', blockId: 'hero', data: { title: 'Про нас' } }], pageData: {} }),
      ],
      ['/pages/translation?path=/contact&locale=ru', { method: 'POST' }],
      ['/pages/duplicate?path=/about', post({ path: '/team', name: 'Team' })],
      ['/pages?path=/about', post({ path: '/company/about', name: 'Company' })],
      ['/pages?path=/blog/first', { method: 'DELETE' }],
      ['/pages/draft?path=/team', post({ draft: true })],
      ['/composed/create', post({ id: 'card', name: 'Card', template: [] })],
      ['/pages'],
      ['/state?path=/ru/company/about'],
    ])
    expect(answers.memory).toEqual(answers.disk)
    expect(snapshot(memory)).toEqual(dump(dir))

    const { written, removed, moved } = memory.changes()
    expect(Object.fromEntries(moved)).toEqual({
      'pages/company/about.page.md': 'pages/about.page.md',
      'pages/company/about@ru.page.md': 'pages/about@ru.page.md',
    })
    expect(removed.sort()).toEqual(['pages/about.page.md', 'pages/about@ru.page.md', 'pages/blog/first.page.md'])
    expect([...written.keys()].sort()).toEqual([
      'blocks/card.block.yml',
      'data.json',
      'folders.json',
      'pages/company/about.page.md',
      'pages/company/about@ru.page.md',
      'pages/contact.page.md',
      'pages/contact@ru.page.md',
      'pages/team.page.md',
      'pages/team@ru.page.md',
    ])
  })

  it('has no place for uploads without a directory', async () => {
    const service = createEditorService(memoryContentFiles({}))
    const upload = await service.handle(new Request('http://host/upload', { method: 'POST', body: 'x' }))
    expect(upload!.status).toBe(501)
    expect(await (await service.handle(new Request('http://host/images')))!.json()).toEqual([])
  })
})
