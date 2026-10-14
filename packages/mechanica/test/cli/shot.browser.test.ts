import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openPage, type BrowserPage } from '@/cli/browser'
import { runShot } from '@/cli/shot'

// Drives a real headless Chrome/Edge, so it is opt-in:
//   MECHANICA_BROWSER_TESTS=1 bun run --filter mechanica test
// MECHANICA_TEST_BROWSER=<path> picks the executable (default: the one `shot` finds).
const enabled = !!process.env.MECHANICA_BROWSER_TESTS
const browser = process.env.MECHANICA_TEST_BROWSER || undefined

// Layout (CSS px): #hero 0–600 red, spacer 600–1800, #reveal 1800–2100 amber
// (faded in by a transition once scrolled ≥ 800), #stage 2100–4100 blue with a
// sticky green .pin, tail to 5600.
const fixture = fileURLToPath(new URL('../fixtures/shot/scroll-reveal.html', import.meta.url))
const fixtureUrl = pathToFileURL(fixture).href

const RED = '255,0,0'
const AMBER = '255,200,0'
const BLUE = '0,0,255'
const GREEN = '0,128,0'
const WHITE = '255,255,255'

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/** Decode a PNG in the page itself and read back RGB triples at the given points. */
function samplePixels(page: BrowserPage, png: Buffer, points: Array<[number, number]>): Promise<string[]> {
  return page.evaluate<string[]>(`new Promise((done, fail) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      done(${JSON.stringify(points)}.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(',')))
    }
    img.onerror = () => fail(new Error('PNG did not decode'))
    img.src = 'data:image/png;base64,${png.toString('base64')}'
  })`)
}

describe.runIf(enabled)('mechanica/browser on a real browser', () => {
  let page: BrowserPage

  beforeAll(async () => {
    page = await openPage(fixtureUrl, { browser })
  }, 30_000)

  afterAll(async () => {
    await page?.close()
  })

  it('clips a screenshot to a section', async () => {
    const png = await page.screenshot({ section: '#hero' })
    expect(pngSize(png)).toEqual({ width: 1440, height: 600 })
    expect(await samplePixels(page, png, [[10, 10], [1430, 590]])).toEqual([RED, RED])
  })

  it('explains a section that matches nothing, is empty or is not a selector', async () => {
    await expect(page.sectionClip('#nope')).rejects.toThrow(/No element matches "#nope". Ids on the page: #hero, #reveal, #stage, #hidden/)
    await expect(page.sectionClip('#hidden')).rejects.toThrow(/empty box/)
    await expect(page.sectionClip('##')).rejects.toThrow(/not a valid CSS selector/)
  })

  it('reaches a scroll-driven state before freezing, and captures the viewport there', async () => {
    // Not scrolled yet: the reveal section is still transparent (white page behind it).
    const before = await page.screenshot({ full: true })
    expect(pngSize(before).height).toBe(5600)
    expect(await samplePixels(page, before, [[10, 1950]])).toEqual([WHITE])

    // Scroll first: the page's scroll handler adds the class and the
    // transition starts; the freeze then ends it at its final value.
    expect(await page.scrollTo(900)).toBe(900)
    const midTransition = Number(await page.evaluate<string>(`getComputedStyle(document.getElementById('reveal')).opacity`))
    expect(midTransition).toBeLessThan(1)
    await page.freezeAnimations()
    expect(await page.evaluate<string>(`getComputedStyle(document.getElementById('reveal')).opacity`)).toBe('1')

    // Scrolled to 1500, the viewport shows the revealed section at 300–600.
    await page.scrollTo(1500)
    const viewport = await page.screenshot()
    expect(pngSize(viewport)).toEqual({ width: 1440, height: 900 })
    expect(await samplePixels(page, viewport, [[10, 450]])).toEqual([AMBER])
    await page.unfreezeAnimations()
  })

  it('keeps a sticky element pinned in viewport and section captures', async () => {
    await page.scrollTo(2600)
    const viewport = await page.screenshot()
    // The pin is stuck to the top of the viewport (0–400), the stage shows below it.
    expect(await samplePixels(page, viewport, [[1430, 10], [1430, 390], [1430, 500]])).toEqual([GREEN, GREEN, BLUE])

    // A section capture beyond the viewport keeps the pin where scrolling put it:
    // 2600 - 2100 = 500px into the stage.
    const stage = await page.screenshot({ section: '#stage' })
    expect(pngSize(stage)).toEqual({ width: 1440, height: 2000 })
    expect(await samplePixels(page, stage, [[1430, 10], [1430, 510], [1430, 890], [1430, 950]])).toEqual([
      BLUE,
      GREEN,
      GREEN,
      BLUE,
    ])
  })
})

describe.runIf(enabled)('mechanica shot <file.html> on a real browser', () => {
  let outDir: string

  beforeAll(() => {
    outDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-shot-browser-'))
  })

  afterAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  it('writes one PNG per width × scroll × section without a dev server', async () => {
    await runShot(fixture, {
      browser,
      out: outDir,
      width: '1440,390',
      scroll: '2600',
      section: ['#hero', '#stage'],
    })
    const files = fs.readdirSync(outDir).sort()
    expect(files).toHaveLength(4)
    expect(files.every((file) => /-(hero|stage)-y2600-w(1440|390)\.png$/.test(file))).toBe(true)
    const hero390 = files.find((file) => file.endsWith('-hero-y2600-w390.png'))!
    expect(pngSize(fs.readFileSync(join(outDir, hero390)))).toEqual({ width: 390, height: 600 })
  }, 60_000)

  it('fails with a clear message when a section matches nothing', async () => {
    await expect(runShot(fixture, { browser, out: outDir, section: ['#missing'] })).rejects.toThrow(
      /--section "#missing" at 1440px: No element matches "#missing"/,
    )
  }, 60_000)
})
