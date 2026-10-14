import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  parseWidths,
  parseScrolls,
  resolveDataArg,
  previewUrl,
  outputPath,
  shotVariant,
  pageSlug,
  normalizePagePath,
  slugify,
  sectionSlugs,
  classifyTarget,
  foreignShotName,
  captureMode,
  planShot,
  runShot,
} from '@/cli/shot'

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

describe('pageSlug', () => {
  it('names the root page index and dashes nested paths', () => {
    expect(pageSlug('/')).toBe('index')
    expect(pageSlug('/docs')).toBe('docs')
    expect(pageSlug('/docs/getting-started/')).toBe('docs-getting-started')
  })
})

describe('normalizePagePath', () => {
  it('ensures a leading slash and strips trailing slashes', () => {
    expect(normalizePagePath('/')).toBe('/')
    expect(normalizePagePath('docs')).toBe('/docs')
    expect(normalizePagePath('/docs/')).toBe('/docs')
    expect(normalizePagePath(' /docs/api ')).toBe('/docs/api')
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

describe('outputPath with a variant', () => {
  it('always keeps the section/scroll variant, and the width only for several widths', () => {
    expect(outputPath(undefined, 'design', 1440, false, '-hero')).toBe(join('.mech', 'shots', 'design-hero.png'))
    expect(outputPath(undefined, 'design', 390, true, '-hero-y800')).toBe(
      join('.mech', 'shots', 'design-hero-y800-w390.png'),
    )
    expect(outputPath('shots', 'design', 1440, false, '-y800')).toBe(join('shots', 'design-y800.png'))
  })

  it('suffixes an explicit .png file name too, so captures never overwrite each other', () => {
    expect(outputPath('out/shot.png', 'design', 1440, false, '-hero')).toBe('out/shot-hero.png')
    expect(outputPath('out/shot.png', 'design', 1440, false, '')).toBe('out/shot.png')
  })
})

describe('shotVariant', () => {
  it('joins the section slug and the scroll offset', () => {
    expect(shotVariant()).toBe('')
    expect(shotVariant('hero')).toBe('-hero')
    expect(shotVariant(undefined, 0)).toBe('-y0')
    expect(shotVariant('stage-pin', 2400)).toBe('-stage-pin-y2400')
  })
})

describe('parseScrolls', () => {
  it('is undefined when absent and parses one or several offsets', () => {
    expect(parseScrolls(undefined)).toBeUndefined()
    expect(parseScrolls('800')).toEqual([800])
    expect(parseScrolls('0, 800,1600')).toEqual([0, 800, 1600])
  })

  it('rejects empty, negative and non-integer offsets', () => {
    expect(() => parseScrolls('')).toThrow(/Invalid --scroll/)
    expect(() => parseScrolls('-10')).toThrow(/Invalid --scroll/)
    expect(() => parseScrolls('12.5')).toThrow(/Invalid --scroll/)
    expect(() => parseScrolls('800,')).toThrow(/Invalid --scroll/)
  })
})

describe('slugify / sectionSlugs', () => {
  it('keeps letters and digits of any script, dash-joined', () => {
    expect(slugify('Design/Evolve Level/index')).toBe('design-evolve-level-index')
    expect(slugify('Maquette/Página principal')).toBe('maquette-página-principal')
    expect(slugify('--')).toBe('')
  })

  it('derives one slug per selector and disambiguates repeats', () => {
    expect(sectionSlugs(['#hero', '.stage > .pin', 'section:nth-of-type(3)'])).toEqual([
      'hero',
      'stage-pin',
      'section-nth-of-type-3',
    ])
    expect(sectionSlugs(['#hero', '.hero', '*', '>'])).toEqual(['hero', 'hero-2', 'section', 'section-2'])
  })
})

describe('classifyTarget', () => {
  const cwd = process.cwd()

  it('keeps block ids and page paths as before', () => {
    expect(classifyTarget('hero')).toEqual({ kind: 'block', blockId: 'hero' })
    expect(classifyTarget('/docs/')).toEqual({ kind: 'page', path: '/docs' })
    expect(classifyTarget('/')).toEqual({ kind: 'page', path: '/' })
  })

  it('lets --page win over the positional target', () => {
    expect(classifyTarget('hero', 'about')).toEqual({ kind: 'page', path: '/about' })
  })

  it('opens http(s) URLs as they are', () => {
    expect(classifyTarget('https://academy.nebius.com/business')).toEqual({
      kind: 'url',
      url: 'https://academy.nebius.com/business',
    })
    expect(classifyTarget('HTTP://localhost:3000')).toEqual({ kind: 'url', url: 'http://localhost:3000/' })
    expect(() => classifyTarget('https://')).toThrow(/Invalid URL/)
  })

  it('reads a file:// URL as a local file', () => {
    const file = resolve(cwd, 'design', 'index.html')
    const url = pathToFileURL(file).href
    expect(classifyTarget(url)).toEqual({ kind: 'file', url, file })
  })

  it('treats .html paths, ./ and ../ paths as local files relative to cwd', () => {
    const file = resolve(cwd, 'design', 'evolve-level', 'index.html')
    const expected = { kind: 'file', url: pathToFileURL(file).href, file }
    expect(classifyTarget('design/evolve-level/index.html', undefined, cwd)).toEqual(expected)
    expect(classifyTarget('./design/evolve-level/index.html', undefined, cwd)).toEqual(expected)
    expect(classifyTarget('design/evolve-level/INDEX.HTM', undefined, cwd).kind).toBe('file')
    expect(classifyTarget('../handoff/landing', undefined, cwd).kind).toBe('file')
    // An absolute POSIX path to an .html file is a file, not a page path.
    expect(classifyTarget('/tmp/design/index.html', undefined, cwd).kind).toBe('file')
  })

  it('treats a Windows drive path as a local file', () => {
    const target = classifyTarget('C:\\Users\\Den\\design\\evolve-level\\index.html')
    expect(target.kind).toBe('file')
    if (process.platform === 'win32') {
      expect(target).toEqual({
        kind: 'file',
        url: 'file:///C:/Users/Den/design/evolve-level/index.html',
        file: 'C:\\Users\\Den\\design\\evolve-level\\index.html',
      })
      expect(classifyTarget('C:/Users/Den/My Designs/index.html')).toMatchObject({
        url: 'file:///C:/Users/Den/My%20Designs/index.html',
      })
    }
  })

  it('needs a target', () => {
    expect(() => classifyTarget(undefined)).toThrow(/Usage: mechanica shot/)
    expect(() => classifyTarget('  ')).toThrow(/Usage: mechanica shot/)
  })

  it('explains shadow roots and the block-id fallback in the usage text', () => {
    expect(() => classifyTarget(undefined)).toThrow(/open shadow roots \("host >>> inner"/)
    expect(() => classifyTarget(undefined)).toThrow(/a bare #name \(or name\) that matches nothing finds the Mechanica block \[data-block-id="name"\]/)
  })
})

describe('foreignShotName', () => {
  const cwd = process.cwd()

  it('names a file inside cwd by its relative path, extension dropped', () => {
    const target = classifyTarget('design/evolve-level/index.html', undefined, cwd)
    expect(foreignShotName(target, cwd)).toBe('design-evolve-level-index')
  })

  it('names a file outside cwd by its last three path segments', () => {
    const outside = resolve(cwd, '..', '..', 'elsewhere', 'handoffs', 'landing', 'page.html')
    const target = classifyTarget(outside, undefined, cwd)
    expect(foreignShotName(target, cwd)).toBe('handoffs-landing-page')
  })

  it('names a URL by host and path', () => {
    expect(foreignShotName(classifyTarget('https://www.example.com/business/evolve.html'))).toBe(
      'example-com-business-evolve',
    )
    expect(foreignShotName(classifyTarget('http://localhost:3000/'))).toBe('localhost-3000')
    expect(foreignShotName(classifyTarget('https://academy.nebius.com'))).toBe('academy-nebius-com')
  })
})

describe('captureMode', () => {
  it('captures the viewport when scrolling, unless --full or --section say otherwise', () => {
    expect(captureMode('page', { scroll: true })).toBe('viewport')
    expect(captureMode('file', { scroll: true })).toBe('viewport')
    expect(captureMode('block', { scroll: true })).toBe('viewport')
    expect(captureMode('url', { scroll: true, full: true })).toBe('full')
    expect(captureMode('url', { scroll: true, section: true })).toBe('section')
  })

  it('keeps the old defaults: block element for blocks, whole document otherwise', () => {
    expect(captureMode('block', {})).toBe('block')
    expect(captureMode('block', { full: true })).toBe('full')
    expect(captureMode('page', {})).toBe('full')
    expect(captureMode('url', {})).toBe('full')
    expect(captureMode('file', {})).toBe('full')
  })
})

describe('planShot', () => {
  const cwd = process.cwd()
  const design = 'design/evolve-level/index.html'

  it('plans a foreign file shot: name from the path, full page, frozen', () => {
    const plan = planShot(design, { width: '1440,390' }, cwd)
    expect(plan.target.kind).toBe('file')
    expect(plan.name).toBe('design-evolve-level-index')
    expect(plan.widths).toEqual([1440, 390])
    expect(plan.mode).toBe('full')
    expect(plan.freeze).toBe(true)
    expect(plan.sections).toEqual([])
  })

  it('keeps block and page names as before', () => {
    expect(planShot('hero').name).toBe('hero')
    expect(planShot('/docs/api').name).toBe('page-docs-api')
  })

  it('rejects --data for pages, URLs and files', () => {
    for (const target of ['/about', 'https://example.com', design, 'file:///C:/design/index.html']) {
      expect(() => planShot(target, { data: '{"title":"Hi"}' }, cwd)).toThrow('--data applies to block shots only')
    }
    expect(planShot('hero', { data: '{"title":"Hi"}' }).data).toEqual({ title: 'Hi' })
  })

  it('validates --section', () => {
    expect(() => planShot('hero', { section: ['#hero'] })).toThrow(/--section applies to page, URL and file shots/)
    expect(() => planShot(design, { section: ['#hero', ' '] }, cwd)).toThrow(/--section needs a CSS selector/)
    const plan = planShot(design, { section: ['#hero', ' .stage > .pin '] }, cwd)
    expect(plan.mode).toBe('section')
    expect(plan.sections).toEqual([
      { selector: '#hero', slug: 'hero' },
      { selector: '.stage > .pin', slug: 'stage-pin' },
    ])
  })

  it('accepts >>> in --section and rejects an empty side before any browser starts', () => {
    const plan = planShot(design, { section: ['code-island >>> section.abc'] }, cwd)
    expect(plan.sections).toEqual([{ selector: 'code-island >>> section.abc', slug: 'code-island-section-abc' }])
    expect(() => planShot(design, { section: ['>>> .abc'] }, cwd)).toThrow(
      '--section ">>> .abc": empty selector around ">>>"',
    )
  })

  it('makes --scroll capture the viewport (or the full page with --full)', () => {
    const plan = planShot('/about', { scroll: '0,800' })
    expect(plan.scrolls).toEqual([0, 800])
    expect(plan.mode).toBe('viewport')
    expect(planShot('/about', { scroll: '800', full: true }).mode).toBe('full')
    expect(() => planShot('/about', { scroll: '' })).toThrow(/Invalid --scroll/)
  })

  it('turns the freeze off with --no-freeze', () => {
    expect(planShot(design, { noFreeze: true }, cwd).freeze).toBe(false)
  })
})

describe('runShot on a local file (checked before any browser starts)', () => {
  it('fails on a missing file or a directory', async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'mech-shot-'))
    await expect(runShot(join(dir, 'missing.html'))).rejects.toThrow(/^File not found: .*missing\.html$/)
    const folder = join(dir, 'export.html')
    fs.mkdirSync(folder)
    await expect(runShot(folder)).rejects.toThrow(/is a directory, not an HTML file/)
  })

  it('explains a page path that Git Bash rewrote into a Windows path', async () => {
    const before = process.env.MSYSTEM
    process.env.MSYSTEM = 'MINGW64'
    try {
      await expect(runShot('C:\\Program Files\\Git\\no-such-page')).rejects.toThrow(
        /Git Bash rewrote it: write it with two slashes \(\/\/about\) or set MSYS_NO_PATHCONV=1/,
      )
    } finally {
      if (before === undefined) delete process.env.MSYSTEM
      else process.env.MSYSTEM = before
    }
  })
})
