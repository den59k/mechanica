import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { type Block } from 'mechanica-shared'
import { serializePage } from 'mechanica-shared/page-format'
import { setPageBlocks } from '@/vite/dev/pages-store'
import { buildPageState } from '@/vite/dev/page-state'

let mechDir: string

beforeEach(() => {
  mechDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-'))
  fs.mkdirSync(join(mechDir, 'pages'), { recursive: true })
})
afterEach(() => {
  setPageBlocks(undefined)
  fs.rmSync(mechDir, { recursive: true, force: true })
})

function writePage(relative: string, data: Record<string, unknown>) {
  const file = join(mechDir, 'pages', relative)
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, serializePage({ content: [], data: {}, ...data }))
}

const heroMeta: Block = {
  id: 'hero',
  name: 'Hero',
  // Shaped like toBlockMeta's unfolded output (all non-optional keys required).
  props: {
    type: 'object',
    required: ['title', 'subtitle'],
    properties: {
      title: { type: 'string', default: 'Start here' },
      subtitle: { type: 'string' },
    },
  },
}

describe('buildPageState block-prop defaults', () => {
  it('bakes schema defaults into the dev state, like export does', () => {
    writePage('home.page.md', {
      content: [{ id: 'h', blockId: 'hero', data: { subtitle: 'kept' } }],
    })
    setPageBlocks([heroMeta])

    const state = buildPageState(mechDir, '/home')
    expect(state.content[0]!.data).toEqual({ title: 'Start here', subtitle: 'kept' })

    // The read itself does not rewrite the file.
    const raw = fs.readFileSync(join(mechDir, 'pages', 'home.page.md'), 'utf-8')
    expect(raw).not.toContain('Start here')
  })

  it('serves untouched data when block metadata is not configured yet', () => {
    writePage('home.page.md', {
      content: [{ id: 'h', blockId: 'hero', data: {} }],
    })
    const state = buildPageState(mechDir, '/home')
    expect(state.content[0]!.data).toEqual({})
  })
})
