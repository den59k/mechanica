import { serializeState } from './generate-page'

/**
 * SEO helpers shared by `mechanica export` and the future render backend.
 * Everything here is pure string work over already-rendered HTML — DOM-free,
 * like the rest of this package.
 */

/** The public URL of an exported page: origin + directory-style path. */
export function pageUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return path === '/' ? `${base}/` : `${base}${path}/`
}

/** The path of the n-th chunk of a paginated page (`/blog` → `/blog/2`). */
export function paginationVariantPath(basePath: string, page: number): string {
  if (page <= 1) return basePath
  return `${basePath === '/' ? '' : basePath}/${page}`
}

export interface SeoTagOptions {
  /** Absolute site origin (`https://example.com`). Enables all URL-based tags. */
  siteUrl?: string
  /** Site display name — emits WebSite JSON-LD on the root page. */
  siteName?: string
  /** The page's exported path (`/`, `/blog`, `/blog/2`). */
  path: string
  /** Inject `<meta name="robots" content="noindex">`. */
  noindex?: boolean
  /** Set for paginated pages (page 1 included) — emits prev/next + title suffix. */
  pagination?: { page: number; pageCount: number; basePath: string }
  /**
   * True when the index template references `page.pagination` itself — the
   * author handles variant titles, so no automatic "— Page N" suffix.
   */
  templateHandlesPagination?: boolean
  /** Breadcrumb trail (root first) — emits BreadcrumbList JSON-LD. */
  breadcrumbs?: { name: string; path: string }[]
}

/** Meta properties whose `content` must be an absolute URL per the OG/Twitter specs. */
const ABSOLUTE_URL_METAS =
  /^(?:og:url|og:image(?::url|:secure_url)?|og:video(?::url|:secure_url)?|og:audio(?::url|:secure_url)?|twitter:image(?::src)?)$/

/**
 * Rewrite root-relative `content` values (`/media/x.jpg`) of Open Graph /
 * Twitter URL metas to absolute URLs — crawlers reject relative ones, so a
 * templated `{{ head.image.src }}` would otherwise silently break link previews.
 */
function absolutizeSocialUrls(html: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    const name = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!name || !ABSOLUTE_URL_METAS.test(name)) return tag
    // Root-relative only; `//host/…` protocol-relative URLs are left alone.
    return tag.replace(/(content\s*=\s*["'])\/(?!\/)/i, `$1${base}/`)
  })
}

/** An inline JSON-LD script (script-safe serialization — see serializeState). */
function jsonLdScript(value: unknown): string {
  return `<script type="application/ld+json">${serializeState(value)}</script>`
}

/**
 * Inject the SEO tags a page can't reasonably be asked to author by hand:
 * canonical URL, `og:url`, absolute social-image URLs, robots noindex,
 * pagination prev/next + "— Page N" titles, and WebSite / BreadcrumbList
 * JSON-LD. Tags the template already contains are never duplicated, so a
 * hand-authored `<head>` always wins.
 */
export function applySeoTags(html: string, options: SeoTagOptions): string {
  if (!html.includes('</head>')) return html
  const { siteUrl, pagination } = options
  const tags: string[] = []

  if (siteUrl) {
    html = absolutizeSocialUrls(html, siteUrl)
    const url = pageUrl(siteUrl, options.path)
    if (!/rel\s*=\s*["']canonical["']/i.test(html)) tags.push(`<link rel="canonical" href="${url}">`)
    if (!/(?:property|name)\s*=\s*["']og:url["']/i.test(html)) {
      tags.push(`<meta property="og:url" content="${url}">`)
    }
  }

  if (options.noindex && !/name\s*=\s*["']robots["']/i.test(html)) {
    tags.push('<meta name="robots" content="noindex">')
  }

  if (pagination) {
    // Variants otherwise ship the base page's exact <title> — duplicate titles
    // across /blog, /blog/2, … — unless the template handles pagination itself.
    if (pagination.page > 1 && !options.templateHandlesPagination) {
      html = html.replace(
        /<title>([\s\S]*?)<\/title>/i,
        (_match, title) => `<title>${title} — Page ${pagination.page}</title>`,
      )
    }
    if (siteUrl) {
      if (pagination.page > 1) {
        const prev = paginationVariantPath(pagination.basePath, pagination.page - 1)
        tags.push(`<link rel="prev" href="${pageUrl(siteUrl, prev)}">`)
      }
      if (pagination.page < pagination.pageCount) {
        const next = paginationVariantPath(pagination.basePath, pagination.page + 1)
        tags.push(`<link rel="next" href="${pageUrl(siteUrl, next)}">`)
      }
    }
  }

  if (siteUrl && options.siteName && options.path === '/' && !/"@type"\s*:\s*"WebSite"/.test(html)) {
    tags.push(
      jsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: options.siteName,
        url: pageUrl(siteUrl, '/'),
      }),
    )
  }

  const crumbs = options.breadcrumbs
  if (siteUrl && crumbs && crumbs.length > 1 && !/"@type"\s*:\s*"BreadcrumbList"/.test(html)) {
    tags.push(
      jsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: crumb.name,
          item: pageUrl(siteUrl, crumb.path),
        })),
      }),
    )
  }

  if (tags.length) html = html.replace('</head>', `${tags.join('\n')}\n</head>`)
  return html
}

/**
 * Cheap regex-level SEO audit of a rendered page. Returns human-readable
 * issues (empty title, missing description, h1 problems, images without alt)
 * — the export surfaces them as warnings, same philosophy as the link validator.
 */
export function auditPageHtml(html: string): string[] {
  const issues: string[] = []

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!title) issues.push('no <title> tag')
  else if (!title[1]!.trim()) issues.push('empty <title>')

  let description: string | undefined
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/name\s*=\s*["']description["']/i.test(tag)) continue
    description = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
  }
  if (description === undefined) issues.push('no meta description')
  else if (!description.trim()) issues.push('empty meta description')

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length
  if (h1Count === 0) issues.push('no <h1> heading')
  else if (h1Count > 1) issues.push(`${h1Count} <h1> headings — search engines expect one`)

  const missingAlt = (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => !/\balt\s*=/i.test(tag)).length
  if (missingAlt > 0) issues.push(`${missingAlt} <img> without alt text`)

  return issues
}

export interface SitemapEntry {
  path: string
  /** ISO date (`2026-07-04`) — emitted as `<lastmod>`. */
  lastmod?: string
}

/** Build a sitemap.xml for the exported pages (directory-style URLs). */
export function buildSitemap(siteUrl: string, entries: SitemapEntry[]): string {
  const urls = [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path, lastmod }) => {
      const suffix = lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
      return `  <url><loc>${pageUrl(siteUrl, path)}</loc>${suffix}</url>`
    })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/** The default robots.txt emitted alongside a sitemap (unless the site ships its own). */
export function buildRobotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl.replace(/\/+$/, '')}/sitemap.xml\n`
}
