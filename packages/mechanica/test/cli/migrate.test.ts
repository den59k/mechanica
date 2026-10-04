import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { migrateContentText, runMigrate } from '@/cli/migrate'

let cwd: string

const write = (file: string, text: string) => {
  const path = join(cwd, '.mech', file)
  fs.mkdirSync(join(path, '..'), { recursive: true })
  fs.writeFileSync(path, text)
}
const read = (file: string) => fs.readFileSync(join(cwd, '.mech', file), 'utf-8')

beforeEach(() => {
  cwd = fs.mkdtempSync(join(os.tmpdir(), 'mech-migrate-'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('mechanica migrate', () => {
  it('rewrites the old upload prefix wherever content can hold it', async () => {
    write('pages/index.page.md', '::: hero #h\nphoto:\n  src: /@mechanica/assets/team.jpg\n:::\n\n![Team](/@mechanica/assets/team.jpg)\n')
    write('pages/blog/post@ru.page.md', 'image: /@mechanica/assets/a b.png\n')
    write('blocks/card.block.yml', 'template:\n  - src: /@mechanica/assets/bg.webp\n')
    write('data.json', '{"logo":{"src":"/@mechanica/assets/logo.svg"}}')
    write('pages/plain.page.md', 'no uploads here\n')

    const changed = await runMigrate({ cwd })

    expect(changed.sort()).toEqual([
      'blocks/card.block.yml',
      'data.json',
      'pages/blog/post@ru.page.md',
      'pages/index.page.md',
    ])
    expect(read('pages/index.page.md')).toBe('::: hero #h\nphoto:\n  src: /media/team.jpg\n:::\n\n![Team](/media/team.jpg)\n')
    expect(read('pages/blog/post@ru.page.md')).toBe('image: /media/a b.png\n')
    expect(read('blocks/card.block.yml')).toContain('src: /media/bg.webp')
    expect(read('data.json')).toBe('{"logo":{"src":"/media/logo.svg"}}')
  })

  it('leaves uploads, the image manifest and generated files alone, and is a no-op the second time', async () => {
    write('assets/notes.md', 'see /@mechanica/assets/x.png')
    write('images.json', '{"/@mechanica/assets/x.png":{}}')
    write('thumbs/index.json', '/@mechanica/assets/x.png')
    write('pages/index.page.md', 'src: /@mechanica/assets/x.png\n')

    expect(await runMigrate({ cwd })).toEqual(['pages/index.page.md'])
    expect(read('assets/notes.md')).toContain('/@mechanica/assets/')
    expect(read('images.json')).toContain('/@mechanica/assets/')
    expect(await runMigrate({ cwd })).toEqual([])
  })

  it('does nothing in a project without content', async () => {
    expect(await runMigrate({ cwd })).toEqual([])
  })

  it('migrateContentText is idempotent', () => {
    const once = migrateContentText('a /@mechanica/assets/x.png b')
    expect(once).toBe('a /media/x.png b')
    expect(migrateContentText(once)).toBe(once)
  })
})
