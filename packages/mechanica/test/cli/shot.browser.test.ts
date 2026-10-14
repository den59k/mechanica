import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openPage, type BrowserPage } from '@/cli/browser'
import { platformBrowserCandidates, startBrowser, startFirstBrowser, launchBrowser } from '@/cli/headless'
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

// Layout (CSS px): #top 0–300 red; section.abc 300–700 blue inside #island's
// open shadow root (light p.slotted 300–350 slotted into it); .deep 700–900
// amber in a nested shadow root; [data-block-id="credibility"] 900–1150 green.
const shadowFixture = fileURLToPath(new URL('../fixtures/shot/shadow-sections.html', import.meta.url))
const shadowFixtureUrl = pathToFileURL(shadowFixture).href

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
    await expect(page.sectionClip('#nope')).rejects.toThrow(
      'No element matches "#nope" (nor [data-block-id="nope"]). Ids on the page: #hero, #reveal, #stage, #hidden',
    )
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

describe.runIf(enabled)('sections inside shadow roots and Mechanica blocks on a real browser', () => {
  let page: BrowserPage
  let outDir: string

  beforeAll(async () => {
    page = await openPage(shadowFixtureUrl, { browser })
    outDir = fs.mkdtempSync(join(os.tmpdir(), 'mech-shot-shadow-'))
  }, 30_000)

  afterAll(async () => {
    await page?.close()
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  it('finds a section inside an open shadow root, nested ones too', async () => {
    expect(await page.sectionClip('section.abc')).toEqual({ x: 0, y: 300, width: 1440, height: 400 })
    expect(await page.sectionClip('.deep')).toEqual({ x: 0, y: 700, width: 1440, height: 200 })
    expect(await page.sectionClip('.slotted')).toEqual({ x: 0, y: 300, width: 1440, height: 50 })
    const png = await page.screenshot({ section: '.deep' })
    expect(pngSize(png)).toEqual({ width: 1440, height: 200 })
    expect(await samplePixels(page, png, [[10, 10], [1430, 190]])).toEqual([AMBER, AMBER])
  })

  it('crosses a shadow boundary at >>>', async () => {
    expect(await page.sectionClip('#island >>> section.abc')).toEqual({ x: 0, y: 300, width: 1440, height: 400 })
    expect(await page.sectionClip('code-island >>> inner-island >>> .deep')).toEqual({
      x: 0,
      y: 700,
      width: 1440,
      height: 200,
    })
  })

  it('finds a Mechanica block by #id or bare id through data-block-id', async () => {
    const box = { x: 0, y: 900, width: 1440, height: 250 }
    expect(await page.sectionClip('#credibility')).toEqual(box)
    expect(await page.sectionClip('credibility')).toEqual(box)
    const png = await page.screenshot({ section: '#credibility' })
    expect(await samplePixels(page, png, [[10, 10]])).toEqual([GREEN])
  })

  it('lists ids and block ids from shadow roots when nothing matches', async () => {
    await expect(page.sectionClip('#nope')).rejects.toThrow(
      'No element matches "#nope" (nor [data-block-id="nope"]). Ids on the page: #top, #island, #inner-cred. ' +
        'Block ids (data-block-id): credibility, shadow-block',
    )
  })

  it('shoots shadow-DOM and block sections with mechanica shot', async () => {
    await runShot(shadowFixture, { browser, out: join(outDir, 'shadow.png'), section: ['section.abc', '#credibility'] })
    const files = fs.readdirSync(outDir).sort()
    expect(files).toEqual(['shadow-credibility.png', 'shadow-section-abc.png'])
    expect(pngSize(fs.readFileSync(join(outDir, files[1]!)))).toEqual({ width: 1440, height: 400 })
    expect(pngSize(fs.readFileSync(join(outDir, files[0]!)))).toEqual({ width: 1440, height: 250 })
  }, 60_000)
})

describe.runIf(enabled)('browser launch on a real machine', () => {
  // A program that exits at once when started like a browser (Node or Bun
  // rejects the browser flags): the stand-in for Edge exiting early.
  const broken = { label: 'Broken browser', path: process.execPath }
  const real = browser ?? platformBrowserCandidates().find((candidate) => fs.existsSync(candidate.path))?.path

  it('falls through a browser that exits early to the next candidate', async () => {
    const failures: string[] = []
    const launched = await startFirstBrowser([broken, { label: 'Real browser', path: real! }], async (candidate) => {
      try {
        return await startBrowser(candidate)
      } catch (error) {
        failures.push(`${candidate.label}: ${(error as Error).message}`)
        throw error
      }
    })
    try {
      expect(failures).toEqual([expect.stringMatching(/^Broken browser: browser exited early \(code \d+\)/)])
      const version = await launched.client.send('Browser.getVersion')
      expect(version.product).toMatch(/\d+\.\d+/)
    } finally {
      await launched.close()
    }
  }, 60_000)

  it('does not fall back from an explicit --browser', async () => {
    await expect(launchBrowser(broken.path)).rejects.toThrow(
      /^Failed to start browser from --browser \(.+\): browser exited early/,
    )
  }, 60_000)
})
