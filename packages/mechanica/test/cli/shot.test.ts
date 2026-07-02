import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { parseWidths, resolveDataArg, previewUrl, outputPath } from '@/cli/shot'

describe('parseWidths', () => {
  it('defaults to a desktop width', () => {
    expect(parseWidths(undefined)).toEqual([1440])
  })

  it('parses a comma-separated list', () => {
    expect(parseWidths('1440, 768,390')).toEqual([1440, 768, 390])
  })

  it('rejects non-numeric and non-positive widths', () => {
    expect(() => parseWidths('big')).toThrow(/Invalid --width/)
    expect(() => parseWidths('1440,0')).toThrow(/Invalid --width/)
  })
})

describe('resolveDataArg', () => {
  it('returns undefined when absent', () => {
    expect(resolveDataArg(undefined)).toBeUndefined()
  })

  it('parses inline JSON objects', () => {
    expect(resolveDataArg('{"title":"Hi"}')).toEqual({ title: 'Hi' })
  })

  it('reads @file payloads, tolerating a UTF-8 BOM', () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'mech-shot-'))
    const file = join(dir, 'data.json')
    fs.writeFileSync(file, '{"count": 3}')
    expect(resolveDataArg(`@${file}`)).toEqual({ count: 3 })

    const bomFile = join(dir, 'bom.json')
    fs.writeFileSync(bomFile, '﻿{"count": 4}')
    expect(resolveDataArg(`@${bomFile}`)).toEqual({ count: 4 })
  })

  it('rejects malformed JSON and non-objects', () => {
    expect(() => resolveDataArg('{oops')).toThrow(/not valid JSON/)
    expect(() => resolveDataArg('[1,2]')).toThrow(/JSON object/)
  })
})

describe('previewUrl', () => {
  it('builds the preview route URL', () => {
    expect(previewUrl('http://localhost:5173/', 'hero')).toBe(
      'http://localhost:5173/@mechanica/preview/hero',
    )
  })

  it('encodes the data payload as a query param', () => {
    const url = previewUrl('http://x', 'hero', { title: 'A & B' })
    expect(url).toContain('/@mechanica/preview/hero?data=')
    const encoded = url.split('?data=')[1]!
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual({ title: 'A & B' })
  })
})

describe('outputPath', () => {
  it('defaults to .mech/shots/<blockId>.png', () => {
    expect(outputPath(undefined, 'hero', 1440, false)).toBe(join('.mech', 'shots', 'hero.png'))
  })

  it('suffixes the width when shooting multiple viewports', () => {
    expect(outputPath(undefined, 'hero', 390, true)).toBe(join('.mech', 'shots', 'hero-w390.png'))
    expect(outputPath('out/shot.png', 'hero', 390, true)).toBe('out/shot-w390.png')
  })

  it('treats a non-.png out value as a directory', () => {
    expect(outputPath('shots', 'hero', 1440, false)).toBe(join('shots', 'hero.png'))
  })
})
