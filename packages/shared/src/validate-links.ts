import type { Block } from './types'
import { walkTree, walkSchema } from './schema'

/** A link on a page pointing at an internal path no page is exported for. */
export interface LinkIssue {
  /** The page the broken link lives on. */
  page: string
  /** The internal URL with no matching page. */
  url: string
}

/** Normalize an internal URL for page-path comparison (drop query/hash/trailing slash). */
export function normalizeInternalUrl(url: string): string {
  const bare = url.split(/[?#]/)[0]!
  const trimmed = bare.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Collect the internal link targets on a page: every `smartLink`-formatted
 * field whose URL is site-relative (starts with `/`) and not marked external.
 */
export function collectInternalLinks(content: unknown[], blocksMap: Map<string, Block>): string[] {
  const found: string[] = []
  walkTree(content as never, (block: any) => {
    const meta = blocksMap.get(block.blockId)
    if (!meta) return
    walkSchema(block.data, meta.props, (value: any, schema: any) => {
      if (schema?.format !== 'smartLink' || value == null) return
      const url = typeof value === 'string' ? value : value.url
      const external = typeof value === 'object' && value.external === true
      if (typeof url === 'string' && url.startsWith('/') && !external) found.push(url)
    })
  })
  return found
}

/**
 * Cross-check every page's internal `smartLink` targets against the set of
 * page paths that actually exist. Returns the dead links (empty = all good).
 * Meant for export/deploy time — a warning, not a hard failure, since a target
 * may be intentionally served by something else (redirects, external hosting).
 */
export function validateLinks(
  pages: Array<{ path: string; content?: unknown[] }>,
  blocksMap: Map<string, Block>,
): LinkIssue[] {
  const known = new Set(pages.map((page) => normalizeInternalUrl(page.path)))
  const issues: LinkIssue[] = []
  for (const page of pages) {
    for (const url of collectInternalLinks(page.content ?? [], blocksMap)) {
      if (!known.has(normalizeInternalUrl(url))) issues.push({ page: page.path, url })
    }
  }
  return issues
}
