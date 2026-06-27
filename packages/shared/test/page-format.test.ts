import { describe, it, expect } from 'vitest'
import { parsePage, serializePage, PageParseError, type PageDoc } from '@/page-format'
import type { ContentBlock } from '@/types'

/** Round-trip a doc through serialize → parse and expect the tree to survive. */
function roundTrip(doc: PageDoc): PageDoc {
  return parsePage(serializePage(doc))
}

describe('page-format: round-trip', () => {
  it('preserves a flat page with scalars, objects and arrays', () => {
    const doc: PageDoc = {
      name: 'Home',
      meta: { title: 'Mechanica' },
      data: { head: { title: 'Mechanica', description: 'Build Vue sites.' } },
      content: [
        {
          id: 'hero',
          blockId: 'landing-hero',
          data: {
            eyebrow: 'Vite 8 · Vue 3.5 · Bun',
            title: 'Build Vue sites with a visual block editor',
            primaryHref: '#get-started',
            secondary: { url: '/docs', title: 'Read the docs', external: false, openNewTab: true },
          },
        },
        {
          id: 'logos',
          blockId: 'logo-strip',
          data: { items: [{ name: 'Vite 8' }, { name: 'Vue 3.5' }, { name: 'Bun' }] },
        },
      ],
    }
    expect(roundTrip(doc)).toEqual(doc)
  })

  it('preserves nested blocks (default slot) with deep prop arrays', () => {
    const doc: PageDoc = {
      name: 'Home',
      data: {},
      content: [
        {
          id: 'card',
          blockId: 'card',
          data: { title: 'Card title' },
          children: [
            { id: 'quote', blockId: 'testimonial', data: { author: 'Alex Rivera', avatar: { src: '' } } },
            {
              id: 'pricing',
              blockId: 'pricing',
              data: {
                plans: [
                  { name: 'Open source', price: '$0', featured: false, features: [{ text: 'Visual editor' }] },
                  { name: 'Team', price: '$19', featured: true, features: [{ text: 'Hosted SSR' }] },
                ],
              },
            },
          ],
        },
      ],
    }
    expect(roundTrip(doc)).toEqual(doc)
  })

  it('preserves named slots as a children map, default slot as an array', () => {
    const doc: PageDoc = {
      data: {},
      content: [
        {
          id: 'split',
          blockId: 'split',
          data: { gap: 'lg' },
          children: {
            start: [{ id: 'a', blockId: 'prose', data: { body: 'Left.' } }],
            end: [{ id: 'b', blockId: 'prose', data: { body: 'Right.' } }],
          },
        },
        { id: 'sec', blockId: 'section', data: {}, children: [{ id: 'c', blockId: 'hero', data: {} }] },
      ],
    }
    const back = roundTrip(doc)
    expect(back).toEqual(doc)
    expect(Array.isArray((back.content[0]!.children as Record<string, unknown>).start)).toBe(true)
    expect(Array.isArray(back.content[1]!.children)).toBe(true)
  })

  it('preserves multi-line Markdown prose in @field regions verbatim', () => {
    const body = '## Heading\n\nA paragraph with a colon: like this, a dash - like this,\nand a # hash.\n\n- bullet one\n- bullet two'
    const doc: PageDoc = {
      data: {},
      content: [{ id: 'p', blockId: 'prose', data: { title: 'Doc', body } }],
    }
    const back = roundTrip(doc)
    expect((back.content[0]!.data as { body: string }).body).toBe(body)
  })

  it('preserves tricky scalars: emoji, Cyrillic, base64, empties, hashes', () => {
    const doc: PageDoc = {
      data: {},
      content: [
        {
          id: 'x',
          blockId: 'banner',
          data: {
            icon: '🪄',
            cyr: 'йцууйц',
            href: '#get-started',
            blob: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            empty: '',
            items: [],
            obj: {},
            tone: 'no', // must survive as the string, not boolean false
          },
        },
      ],
    }
    expect(roundTrip(doc)).toEqual(doc)
  })

  it('serialize is idempotent on its own canonical output', () => {
    const doc: PageDoc = {
      name: 'Docs',
      data: { head: { title: 'Docs' } },
      content: [
        { id: 'd', blockId: 'docs-article', data: { title: 'Getting started', lead: 'x'.repeat(120) } },
      ],
    }
    const once = serializePage(doc)
    expect(serializePage(parsePage(once))).toBe(once)
  })
})

describe('page-format: serialized shape', () => {
  const doc: PageDoc = {
    name: 'Home',
    data: {},
    content: [
      {
        id: 'card',
        blockId: 'card',
        data: { title: 'Card', subtitle: 'A short single-line subtitle' },
        children: [{ id: 'kid', blockId: 'hero', data: { title: 'Hi' } }],
      },
      { id: 'lone', blockId: 'hero', data: { title: 'Bye' } },
    ],
  }
  const text = serializePage(doc)

  it('promotes long top-level strings to @field regions, keeps short ones inline', () => {
    const long = serializePage({
      data: {},
      content: [{ id: 'h', blockId: 'hero', data: { subtitle: 'word '.repeat(30) } }],
    })
    expect(long).toContain('@subtitle')
    expect(text).toContain('subtitle: A short single-line subtitle') // short → inline
  })

  it('labels the close of container blocks and leaves leaf blocks bare', () => {
    expect(text).toContain('::: /card') // container
    const lines = text.split('\n')
    // the lone leaf block closes with a bare :::
    expect(lines.filter((l) => l === ':::').length).toBeGreaterThan(0)
    expect(text).not.toContain('::: /hero')
  })

  it('emits everything flush-left (no nesting indentation)', () => {
    expect(text).toContain('\n::: hero #kid\n') // nested child still at column 0
  })

  it('emits short all-scalar collections in flow style', () => {
    const flow = serializePage({
      data: {},
      content: [{ id: 'l', blockId: 'logos', data: { items: [{ name: 'Vite' }, { name: 'Bun' }] } }],
    })
    expect(flow).toContain('- { name: Vite }')
  })
})

describe('page-format: @field boundaries', () => {
  it('does not let colons, hashes, or blank lines end a region', () => {
    const text = [
      '---',
      'data: {}',
      '---',
      '',
      '::: prose #p',
      '@body',
      'Note: this has a colon.',
      '',
      '# A markdown heading, not a fence.',
      'Still the body.',
      ':::',
    ].join('\n')
    const doc = parsePage(text)
    expect((doc.content[0]!.data as { body: string }).body).toBe(
      'Note: this has a colon.\n\n# A markdown heading, not a fence.\nStill the body.',
    )
  })

  it('treats ::: and @field inside a code fence as inert content', () => {
    const text = [
      '---',
      'data: {}',
      '---',
      '',
      '::: prose #p',
      '@body',
      'Example:',
      '',
      '```md',
      '::: hero #welcome',
      '@subtitle',
      'inside a fence',
      ':::',
      '```',
      '',
      'After the fence.',
      ':::',
    ].join('\n')
    const doc = parsePage(text)
    expect(doc.content).toHaveLength(1) // the fenced ::: did not open a real block
    const body = (doc.content[0]!.data as { body: string }).body
    expect(body).toContain('::: hero #welcome')
    expect(body).toContain('After the fence.')
  })

  it('honors the backslash escape for a literal line-initial token', () => {
    const text = ['---', 'data: {}', '---', '', '::: prose #p', '@body', '\\::: not a block', ':::'].join('\n')
    const doc = parsePage(text)
    expect((doc.content[0]!.data as { body: string }).body).toBe('::: not a block')
  })
})

describe('page-format: nesting is flush-left', () => {
  it('nests children by ::: pairing at column 0', () => {
    const flush = parsePage(
      ['---', 'data: {}', '---', '', '::: card #c', 'title: C', '::: hero #h', 'title: H', ':::', '::: /card'].join('\n'),
    )
    expect(flush.content[0]!.children).toHaveLength(1)
    expect((flush.content[0]!.children as ContentBlock[])[0]!.blockId).toBe('hero')
  })

  it('rejects an indented child fence — block interiors are flush-left', () => {
    const indented = ['---', 'data: {}', '---', '', '::: card #c', '  ::: hero #h', '  :::', '::: /card'].join('\n')
    expect(() => parsePage(indented)).toThrow(PageParseError)
  })
})

describe('page-format: errors', () => {
  const wrap = (...body: string[]) => ['---', 'data: {}', '---', '', ...body].join('\n')

  it('reports a labeled-close mismatch with a line number', () => {
    let err: PageParseError | undefined
    try {
      parsePage(wrap('::: card #c', 'title: C', '::: hero #h', 'title: H', ':::', '::: /hero'))
    } catch (e) {
      err = e as PageParseError
    }
    expect(err).toBeInstanceOf(PageParseError)
    expect(err!.message).toMatch(/does not match/)
    expect(err!.line).toBe(10) // the "::: /hero" line
  })

  it('reports an unclosed block', () => {
    expect(() => parsePage(wrap('::: card #c', 'title: C'))).toThrow(PageParseError)
  })

  it('reports a stray close', () => {
    expect(() => parsePage(wrap('::: hero #h', ':::', ':::'))).toThrow(/no open block/)
  })

  it('rejects an unknown fence attribute', () => {
    expect(() => parsePage(wrap('::: hero #h bogus=1', ':::'))).toThrow(/Unknown block attribute/)
  })

  it('rejects mixing default and named slots in one block', () => {
    expect(() =>
      parsePage(wrap('::: split #s', '::: hero #a slot=start', ':::', '::: hero #b', ':::', '::: /split')),
    ).toThrow(/mixes default and named slots/)
  })
})

describe('page-format: envelope', () => {
  it('defaults data to an empty object and auto-assigns missing ids', () => {
    const doc = parsePage(['::: hero', 'title: Hi', ':::'].join('\n'))
    expect(doc.data).toEqual({})
    expect(doc.content[0]!.id).toMatch(/^auto\d+$/)
  })

  it('parses an empty document to an empty page', () => {
    expect(parsePage('')).toEqual({ data: {}, content: [] })
  })
})
