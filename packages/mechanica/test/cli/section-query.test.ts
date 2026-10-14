import { describe, it, expect } from 'vitest'
import { FIND_SECTION_SOURCE, blockIdFallback, splitShadowSelector } from '@/cli/section-query'
import { describeSectionError } from '@/cli/browser'

describe('splitShadowSelector', () => {
  it('keeps a selector without >>> whole, trimmed', () => {
    expect(splitShadowSelector(' section.abc > h2 ')).toEqual(['section.abc > h2'])
  })

  it('splits at >>> into trimmed parts', () => {
    expect(splitShadowSelector('code-island >>> section.abc')).toEqual(['code-island', 'section.abc'])
    expect(splitShadowSelector('a-b>>>c-d >>> #x')).toEqual(['a-b', 'c-d', '#x'])
  })

  it('leaves >>> inside quotes, brackets, parentheses and after a backslash alone', () => {
    expect(splitShadowSelector('[title=">>>"]')).toEqual(['[title=">>>"]'])
    expect(splitShadowSelector("[title='a >>> b'] >>> p")).toEqual(["[title='a >>> b']", 'p'])
    expect(splitShadowSelector(':is(a >>> b)')).toEqual([':is(a >>> b)'])
    expect(splitShadowSelector('.a\\>>>b')).toEqual(['.a\\>>>b'])
  })

  it('rejects an empty part', () => {
    expect(() => splitShadowSelector('>>> .a')).toThrow(/empty selector around ">>>"/)
    expect(() => splitShadowSelector('.a >>>')).toThrow(/empty selector around ">>>"/)
    expect(() => splitShadowSelector('.a >>> >>> .b')).toThrow(/empty selector/)
  })
})

describe('blockIdFallback', () => {
  it('turns a bare #name or name into a data-block-id selector', () => {
    expect(blockIdFallback('#hero')).toBe('[data-block-id="hero"]')
    expect(blockIdFallback(' credibility ')).toBe('[data-block-id="credibility"]')
    expect(blockIdFallback('#faq-1')).toBe('[data-block-id="faq-1"]')
    expect(blockIdFallback('#step_2')).toBe('[data-block-id="step_2"]')
  })

  it('also covers names that are not valid CSS ids', () => {
    expect(blockIdFallback('#1hero')).toBe('[data-block-id="1hero"]')
    expect(blockIdFallback('#герой')).toBe('[data-block-id="герой"]')
  })

  it('leaves every other selector alone', () => {
    for (const selector of ['.hero', '#hero .title', 'section.abc', '[data-block-id="x"]', '#a,#b', 'a >>> b', '#', '']) {
      expect(blockIdFallback(selector)).toBeNull()
    }
  })
})

describe('FIND_SECTION_SOURCE', () => {
  it('is a self-contained function expression', () => {
    const find = new Function(`return (${FIND_SECTION_SOURCE})`)()
    expect(typeof find).toBe('function')
    expect(find.length).toBe(2)
  })
})

describe('describeSectionError', () => {
  it('names the fallback that was tried and lists ids and block ids', () => {
    expect(
      describeSectionError('#nope', {
        error: 'missing',
        ids: ['#top', '#inner'],
        blockIds: ['hero', 'credibility'],
        fallback: '[data-block-id="nope"]',
      }),
    ).toBe(
      'No element matches "#nope" (nor [data-block-id="nope"]). Ids on the page: #top, #inner. ' +
        'Block ids (data-block-id): hero, credibility',
    )
  })

  it('stays short when there is nothing to list', () => {
    expect(describeSectionError('.x', { error: 'missing', ids: [] })).toBe('No element matches ".x"')
    expect(describeSectionError('.x', { error: 'missing', ids: [], blockIds: [], fallback: null })).toBe(
      'No element matches ".x"',
    )
  })

  it('explains invalid selectors and empty boxes', () => {
    expect(describeSectionError('##', { error: 'invalid', message: 'bad' })).toBe('"##" is not a valid CSS selector (bad)')
    expect(describeSectionError('#h', { error: 'empty', width: 0, height: 10.4 })).toMatch(/empty box \(0×10\)/)
  })
})
