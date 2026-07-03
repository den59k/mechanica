import type { Connect } from 'vite'
import { serializeState } from 'mechanica-shared'
import type { BlockPreviewRequest } from '../../core/preview'

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The HTML shell for a standalone block preview. Loads Vite's client (HMR +
 * error overlay) and the generated preview entry; the request rides along as
 * `window.__MECHANICA_PREVIEW__`. The `/@id/__x00__…` URL is how Vite addresses
 * a `\0`-resolved virtual module from the browser.
 */
export function renderPreviewHtml(request: BlockPreviewRequest): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Block preview — ${escapeHtml(request.blockId ?? '')}</title>`,
    '<style>html, body { margin: 0; padding: 0; background: #fff; }</style>',
    '</head>',
    '<body>',
    '<div id="app"></div>',
    `<script>window.__MECHANICA_PREVIEW__ = ${serializeState(request)}</script>`,
    '<script type="module" src="/@vite/client"></script>',
    '<script type="module" src="/@id/__x00__virtual:mechanica/preview"></script>',
    '</body>',
    '</html>',
  ].join('\n')
}

/**
 * Dev middleware for `GET /@mechanica/preview/<blockId>[?data=<json>]` —
 * renders one block standalone (with the app's global CSS and a real runtime
 * context) so `mechanica shot` and humans can look at it outside any page.
 * Mounted under its prefix, so `req.url` here is already prefix-stripped.
 */
export function createPreviewMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.method !== 'GET') return next()
    const url = new URL(req.url ?? '/', 'http://localhost')

    const blockId = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''))
    if (!blockId) {
      res.statusCode = 400
      return res.end('Usage: /@mechanica/preview/<blockId>?data=<json>')
    }

    let data: Record<string, unknown> | undefined
    const raw = url.searchParams.get('data')
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('expected a JSON object')
        }
        data = parsed as Record<string, unknown>
      } catch (error) {
        res.statusCode = 400
        return res.end(`Invalid ?data= payload: ${error instanceof Error ? error.message : error}`)
      }
    }

    res.setHeader('content-type', 'text/html')
    res.end(renderPreviewHtml({ blockId, data }))
  }
}
