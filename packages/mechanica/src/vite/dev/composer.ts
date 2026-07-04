import type { Connect } from 'vite'

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The HTML shell for the Block Composer. Loads Vite's client (HMR + error
 * overlay) and the generated composer entry; the target block id rides along as
 * `window.__MECHANICA_COMPOSER__`. The `/@id/__x00__…` URL addresses the
 * `\0`-resolved virtual module from the browser (same as the preview route).
 */
export function renderComposerHtml(blockId: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Composer — ${escapeHtml(blockId)}</title>`,
    '<style>html, body { margin: 0; padding: 0; height: 100%; background: #f2f2f2; }</style>',
    '</head>',
    '<body>',
    '<div id="app"></div>',
    `<script>window.__MECHANICA_COMPOSER__ = ${JSON.stringify({ blockId })}</script>`,
    '<script type="module" src="/@vite/client"></script>',
    '<script type="module" src="/@id/__x00__virtual:mechanica/composer"></script>',
    '</body>',
    '</html>',
  ].join('\n')
}

/**
 * Dev middleware for `GET /@mechanica/composer/<blockId>` — serves the composer
 * shell for that composed block (`~new` for a fresh one). Mounted under its
 * prefix, so `req.url` here is already prefix-stripped. The composer app itself
 * fetches the block via `/@mechanica/composed/get` and saves through the store.
 */
export function createComposerMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.method !== 'GET') return next()
    const url = new URL(req.url ?? '/', 'http://localhost')
    const blockId = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '')) || '~new'
    res.setHeader('content-type', 'text/html')
    res.end(renderComposerHtml(blockId))
  }
}
