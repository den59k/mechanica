import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseSfc, compileScript } from '@vue/compiler-sfc'
import { compileBlock } from './compile-block'

// Real blocks ported from the legacy dev-app, used as a smoke corpus: every one
// must rewrite cleanly and still compile through @vue/compiler-sfc on Vite 8.
const blocksDir = join(import.meta.dirname, '../../test/fixtures/blocks')
const files = readdirSync(blocksDir).filter((f) => f.endsWith('.vue'))

describe('compileBlock — real dev-app blocks', () => {
  it('found fixture blocks', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`compiles ${file}`, () => {
      const source = readFileSync(join(blocksDir, file), 'utf-8')
      const out = compileBlock(source, file)

      // All fixtures are blocks.
      expect(out, `${file} should be recognized as a block`).not.toBeNull()
      expect(out!.code).not.toContain('defineBlock(')
      expect(out!.code).toContain('defineOptions(')

      const { descriptor, errors } = parseSfc(out!.code, { filename: file })
      expect(errors, `${file} should re-parse without errors`).toHaveLength(0)

      const script = compileScript(descriptor, { id: out!.blockId })
      expect(script.content).toContain('blockId')
      expect(script.content).toContain('blockSchema')
    })
  }
})
