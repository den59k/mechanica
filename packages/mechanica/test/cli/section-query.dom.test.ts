import { describe, it, expect, beforeEach } from 'vitest'
import { FIND_SECTION_SOURCE, blockIdFallback, splitShadowSelector, MAX_LISTED_IDS } from '@/cli/section-query'

type Found =
  | { element: Element }
  | { error: 'invalid'; message: string }
  | { error: 'missing'; ids: string[]; blockIds: string[]; fallback: string | null }

// The same text the browser evaluates, run against jsdom's document.
const findSection = new Function(`return (${FIND_SECTION_SOURCE})`)() as (
  parts: string[],
  fallback: string | null,
) => Found

/** What `sectionClip` sends for a selector. */
function find(selector: string): Found {
  const parts = splitShadowSelector(selector)
  return findSection(parts, parts.length === 1 ? blockIdFallback(selector) : null)
}

function element(selector: string): Element | undefined {
  const found = find(selector)
  return 'element' in found ? found.element : undefined
}

function attach(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = html
  return root
}

// A design-handoff-like page: sections rendered inside custom elements with
// open shadow roots (one nested), slotted light content, and Mechanica blocks
// that carry data-block-id instead of an id.
let outer: ShadowRoot
let nested: ShadowRoot
let second: ShadowRoot

beforeEach(() => {
  document.head.innerHTML = '<meta id="head-meta">'
  document.body.innerHTML = `
    <section id="top" class="intro"></section>
    <code-island id="island-a"><p slot="note" class="slotted">note</p></code-island>
    <code-island id="island-b"></code-island>
    <div data-block-id="hero" class="block"></div>
    <svg><g id="svg-internal"></g></svg>
    <div id="w-node-abc"></div>
    <div id="x1234abcd5678"></div>
  `
  const [islandA, islandB] = document.querySelectorAll('code-island')
  outer = attach(
    islandA!,
    `<section class="abc" id="inner-cred"><h2 class="title">A</h2><slot name="note"></slot></section>
     <inner-island></inner-island>`,
  )
  nested = attach(outer.querySelector('inner-island')!, `<section class="deep"><h2 class="title">Deep</h2></section>`)
  second = attach(
    islandB!,
    `<section class="abc second"></section><div data-block-id="shadow-block" id="shadow-id"></div>`,
  )
})

describe('the in-page section lookup', () => {
  it('finds light-DOM elements with document.querySelector first', () => {
    expect(element('#top')).toBe(document.getElementById('top'))
    // A match in the document wins over one in a shadow root.
    document.body.insertAdjacentHTML('beforeend', '<h2 class="title" id="light-title"></h2>')
    expect(element('.title')).toBe(document.getElementById('light-title'))
  })

  it('falls back to open shadow roots, depth first in tree order', () => {
    expect(element('section.abc')).toBe(outer.querySelector('section.abc'))
    expect(element('.second')).toBe(second.querySelector('.second'))
    // The nested root comes right after its host's root, before the next host.
    expect(element('.deep')).toBe(nested.querySelector('.deep'))
    expect(element('.title')).toBe(outer.querySelector('.title'))
  })

  it('matches within each root, never across a shadow boundary', () => {
    // .abc lives in the shadow root of #island-a: no descendant combinator reaches it.
    expect(element('#island-a section.abc')).toBeUndefined()
    expect(element('section.abc .title')).toBe(outer.querySelector('.title'))
  })

  it('finds slotted content in its host tree', () => {
    expect(element('p.slotted')).toBe(document.querySelector('p.slotted'))
    expect(element('#island-a > .slotted')).toBe(document.querySelector('p.slotted'))
  })

  it('crosses into a shadow root at >>>', () => {
    expect(element('#island-b >>> section.abc')).toBe(second.querySelector('section.abc'))
    expect(element('code-island >>> section.abc')).toBe(outer.querySelector('section.abc'))
    // Within the crossed root the search goes deep again.
    expect(element('#island-a >>> .deep')).toBe(nested.querySelector('.deep'))
    expect(element('code-island >>> inner-island >>> .title')).toBe(nested.querySelector('.title'))
    expect(element('#island-b >>> .deep')).toBeUndefined()
    // A host without a shadow root is searched in its light subtree.
    document.body.insertAdjacentHTML('beforeend', '<div id="plain"><span class="inside"></span></div>')
    expect(element('#plain >>> .inside')).toBe(document.querySelector('#plain .inside'))
  })

  it('falls back from #name or name to [data-block-id="name"], shadow roots included', () => {
    expect(element('#hero')).toBe(document.querySelector('[data-block-id="hero"]'))
    expect(element('hero')).toBe(document.querySelector('[data-block-id="hero"]'))
    expect(element('#shadow-block')).toBe(second.querySelector('[data-block-id="shadow-block"]'))
  })

  it('prefers a real id or tag over the block-id fallback', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="hero" class="real"></div><hero></hero>')
    expect(element('#hero')?.className).toBe('real')
    expect(element('hero')?.tagName).toBe('HERO')
  })

  it('reaches a block id that is not a valid CSS id', () => {
    document.body.insertAdjacentHTML('beforeend', '<div data-block-id="1st"></div>')
    expect(element('#1st')).toBe(document.querySelector('[data-block-id="1st"]'))
  })

  it('reports an invalid selector', () => {
    const found = find('##')
    expect(found).toMatchObject({ error: 'invalid' })
    expect(find('#1nothing')).toMatchObject({ error: 'invalid' })
    expect(find('code-island >>> ##')).toMatchObject({ error: 'invalid' })
  })

  it('lists readable ids and block ids from the document and its shadow roots when nothing matches', () => {
    const found = find('#nope')
    expect(found).toEqual({
      error: 'missing',
      ids: ['#top', '#island-a', '#island-b', '#inner-cred', '#shadow-id'],
      blockIds: ['hero', 'shadow-block'],
      fallback: '[data-block-id="nope"]',
    })
    expect(find('.nope')).toMatchObject({ error: 'missing', fallback: null })
  })

  it('caps both lists', () => {
    const many = Array.from({ length: 30 }, (_, i) => `<i id="id-${i}" data-block-id="block-${i}"></i>`).join('')
    document.body.insertAdjacentHTML('beforeend', many)
    const found = find('#nope') as Extract<Found, { error: 'missing' }>
    expect(found.ids).toHaveLength(MAX_LISTED_IDS)
    expect(found.blockIds).toHaveLength(MAX_LISTED_IDS)
  })
})
