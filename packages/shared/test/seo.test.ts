import { describe, it, expect } from 'vitest'
import {
  pageUrl,
  paginationVariantPath,
  applySeoTags,
  auditPageHtml,
  buildSitemap,
  buildRobotsTxt,
} from '@/seo'

const page = (head = '', body = '') => `<html><head><title>Hi</title>${head}</head><body>${body}</body></html>`

describe('pageUrl / paginationVariantPath', () => {
  it('builds directory-style URLs and trims trailing slashes off the origin', () => {
    expect(pageUrl('https://x.com/', '/')).toBe('https://x.com/')
    expect(pageUrl('https://x.com', '/blog/post')).toBe('https://x.com/blog/post/')
  })

  it('maps pagination pages to variant paths (page 1 = the base page)', () => {
    expect(paginationVariantPath('/blog', 1)).toBe('/blog')
    expect(paginationVariantPath('/blog', 3)).toBe('/blog/3')
    expect(paginationVariantPath('/', 2)).toBe('/2')
  })
})

describe('applySeoTags', () => {
  it('injects canonical and og:url when a site url is known', () => {
    const html = applySeoTags(page(), { siteUrl: 'https://x.com', path: '/about' })
    expect(html).toContain('<link rel="canonical" href="https://x.com/about/">')
    expect(html).toContain('<meta property="og:url" content="https://x.com/about/">')
  })

  it('never duplicates tags the template already has', () => {
    const authored = page('<link rel="canonical" href="https://x.com/custom"><meta property="og:url" content="https://x.com/custom">')
    const html = applySeoTags(authored, { siteUrl: 'https://x.com', path: '/about' })
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html.match(/og:url/g)).toHaveLength(1)
    expect(html).toContain('https://x.com/custom')
  })

  it('injects nothing URL-based without a site url', () => {
    const html = applySeoTags(page(), { path: '/about' })
    expect(html).not.toContain('canonical')
    expect(html).not.toContain('og:url')
  })

  it('absolutizes root-relative social image/url metas, leaving others alone', () => {
    const authored = page(
      '<meta property="og:image" content="/media/pic.jpg">' +
        '<meta name="twitter:image" content="/media/pic.jpg">' +
        '<meta property="og:image" content="//cdn.x.com/pic.jpg">' +
        '<meta name="description" content="/not-a-url">',
    )
    const html = applySeoTags(authored, { siteUrl: 'https://x.com', path: '/' })
    expect(html).toContain('<meta property="og:image" content="https://x.com/media/pic.jpg">')
    expect(html).toContain('<meta name="twitter:image" content="https://x.com/media/pic.jpg">')
    expect(html).toContain('content="//cdn.x.com/pic.jpg"') // protocol-relative untouched
    expect(html).toContain('<meta name="description" content="/not-a-url">') // not a URL meta
  })

  it('injects a robots noindex meta, unless the template has its own robots meta', () => {
    expect(applySeoTags(page(), { path: '/x', noindex: true })).toContain(
      '<meta name="robots" content="noindex">',
    )
    const authored = page('<meta name="robots" content="noindex, nofollow">')
    expect(applySeoTags(authored, { path: '/x', noindex: true }).match(/name="robots"/g)).toHaveLength(1)
  })

  it('suffixes variant titles and emits prev/next links', () => {
    const html = applySeoTags(page(), {
      siteUrl: 'https://x.com',
      path: '/blog/2',
      pagination: { page: 2, pageCount: 3, basePath: '/blog' },
    })
    expect(html).toContain('<title>Hi — Page 2</title>')
    expect(html).toContain('<link rel="prev" href="https://x.com/blog/">')
    expect(html).toContain('<link rel="next" href="https://x.com/blog/3/">')
  })

  it('keeps the authored title when the template handles pagination; page 1 gets next only', () => {
    const variant = applySeoTags(page(), {
      siteUrl: 'https://x.com',
      path: '/blog/2',
      pagination: { page: 2, pageCount: 2, basePath: '/blog' },
      templateHandlesPagination: true,
    })
    expect(variant).toContain('<title>Hi</title>')

    const first = applySeoTags(page(), {
      siteUrl: 'https://x.com',
      path: '/blog',
      pagination: { page: 1, pageCount: 3, basePath: '/blog' },
    })
    expect(first).toContain('<title>Hi</title>')
    expect(first).not.toContain('rel="prev"')
    expect(first).toContain('<link rel="next" href="https://x.com/blog/2/">')
  })

  it('emits WebSite JSON-LD on the root page only, when a site name is set', () => {
    const root = applySeoTags(page(), { siteUrl: 'https://x.com', siteName: 'Acme', path: '/' })
    expect(root).toContain('<script type="application/ld+json">')
    expect(root).toContain('"@type":"WebSite"')
    expect(root).toContain('"name":"Acme"')

    const inner = applySeoTags(page(), { siteUrl: 'https://x.com', siteName: 'Acme', path: '/about' })
    expect(inner).not.toContain('"@type":"WebSite"')
    const unnamed = applySeoTags(page(), { siteUrl: 'https://x.com', path: '/' })
    expect(unnamed).not.toContain('"@type":"WebSite"')
  })

  it('emits BreadcrumbList JSON-LD for trails of two or more', () => {
    const html = applySeoTags(page(), {
      siteUrl: 'https://x.com',
      path: '/blog/post',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: 'Post', path: '/blog/post' },
      ],
    })
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(html).toContain('"position":2,"name":"Blog","item":"https://x.com/blog/"')

    const single = applySeoTags(page(), {
      siteUrl: 'https://x.com',
      path: '/about',
      breadcrumbs: [{ name: 'About', path: '/about' }],
    })
    expect(single).not.toContain('BreadcrumbList')
  })

  it('script-escapes JSON-LD content (no </script> breakout)', () => {
    const html = applySeoTags(page(), {
      siteUrl: 'https://x.com',
      siteName: 'Evil</script><script>alert(1)</script>',
      path: '/',
    })
    expect(html).not.toContain('</script><script>alert')
    expect(html).toContain('\\u003c/script') // escaped form survives
  })

  it('leaves HTML without a </head> untouched', () => {
    expect(applySeoTags('<body></body>', { siteUrl: 'https://x.com', path: '/' })).toBe('<body></body>')
  })
})

describe('auditPageHtml', () => {
  it('passes a healthy page silently', () => {
    const html = page('<meta name="description" content="A fine page.">', '<h1>One</h1><img src="x.jpg" alt="x">')
    expect(auditPageHtml(html)).toEqual([])
  })

  it('flags missing/empty title and description', () => {
    expect(auditPageHtml('<html><head></head><body><h1>x</h1></body></html>')).toEqual(
      expect.arrayContaining(['no <title> tag', 'no meta description']),
    )
    const empty = '<html><head><title> </title><meta name="description" content=""></head><body><h1>x</h1></body></html>'
    expect(auditPageHtml(empty)).toEqual(expect.arrayContaining(['empty <title>', 'empty meta description']))
  })

  it('flags h1 count problems and images without alt', () => {
    const none = page('<meta name="description" content="d">', '<img src="a.jpg"><img src="b.jpg" alt="">')
    expect(auditPageHtml(none)).toEqual(expect.arrayContaining(['no <h1> heading', '1 <img> without alt text']))
    const two = page('<meta name="description" content="d">', '<h1>a</h1><h1>b</h1>')
    expect(auditPageHtml(two)).toEqual(expect.arrayContaining(['2 <h1> headings — search engines expect one']))
  })
})

describe('buildSitemap / buildRobotsTxt', () => {
  it('emits sorted directory-style urls with optional lastmod', () => {
    const xml = buildSitemap('https://x.com/', [
      { path: '/blog', lastmod: '2026-07-01' },
      { path: '/' },
    ])
    expect(xml).toContain('<url><loc>https://x.com/</loc></url>')
    expect(xml).toContain('<url><loc>https://x.com/blog/</loc><lastmod>2026-07-01</lastmod></url>')
    expect(xml.indexOf('https://x.com/</loc>')).toBeLessThan(xml.indexOf('/blog/'))
  })

  it('robots.txt allows everything and points at the sitemap', () => {
    const txt = buildRobotsTxt('https://x.com/')
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Sitemap: https://x.com/sitemap.xml')
  })
})
