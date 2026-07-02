import fs from 'node:fs'
import { resolve, sep } from 'node:path'
import type { Connect } from 'vite'
import {
  createPage,
  duplicatePage,
  deletePage,
  savePage,
  renamePage,
  movePage,
  listPages,
  listFolders,
  pageVersion,
  PageExistsError,
} from './pages-store'
import { saveUpload, listImages } from './assets-store'
import { resolveDevQuery } from './query-dev'
import { mergeSiteData, mergeFolderData, folderOf } from './data-store'
import { buildPageState } from './page-state'

export interface DevMiddlewareOptions {
  /** Awaited before serving `/state`, so richText fields convert consistently. */
  ready?: () => Promise<void> | void
}

/**
 * The `/@mechanica` dev middleware: page CRUD, asset upload/serve, folder list,
 * and query resolution against the local `.mech` store. Mounted under the
 * `/@mechanica` prefix, so `req.url` here is already prefix-stripped.
 */
export function createDevMiddleware(
  mechDir: string,
  options: DevMiddlewareOptions = {},
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url
    const query = url.searchParams

    const json = (data: unknown, status = 200) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(data))
    }

    /**
     * Stream a file from a directory under `.mech`, containing the resolved
     * path so an encoded `..` (or an absolute path) cannot escape it.
     */
    const serveFrom = (dirName: string, prefix: string) => {
      const dir = resolve(mechDir, dirName)
      const file = resolve(dir, decodeURIComponent(pathname.slice(prefix.length)))
      if (file !== dir && !file.startsWith(dir + sep)) {
        res.statusCode = 403
        return res.end('Forbidden')
      }
      if (!fs.existsSync(file)) {
        res.statusCode = 404
        return res.end('Not found')
      }
      return fs.createReadStream(file).pipe(res)
    }

    try {
      if (pathname.startsWith('/assets/')) return serveFrom('assets', '/assets/')
      if (pathname.startsWith('/thumbs/')) {
        // Regenerated in place by `mechanica thumbs` — always revalidate.
        res.setHeader('cache-control', 'no-cache')
        return serveFrom('thumbs', '/thumbs/')
      }

      if (pathname === '/images' && req.method === 'GET') return json(listImages(mechDir))
      if (pathname === '/folders' && req.method === 'GET') return json(listFolders(mechDir))

      if (pathname === '/query' && req.method === 'GET') {
        const key = query.get('q')
        if (!key) return json({ error: 'Missing query key' }, 400)
        return json(resolveDevQuery(mechDir, key))
      }

      if (pathname === '/upload' && req.method === 'POST') {
        const body = await readBody(req)
        const header = (req.headers['x-file-name'] as string) ?? 'file'
        // The client percent-encodes the name so spaces/unicode survive the header.
        let name = header
        try {
          name = decodeURIComponent(header)
        } catch {
          /* malformed encoding — keep the raw header value */
        }
        return json(await saveUpload(mechDir, name, body))
      }

      if (pathname === '/state' && req.method === 'GET') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        await options.ready?.()
        return json(buildPageState(mechDir, pathParam))
      }

      if (pathname === '/pages' && req.method === 'GET') return json(listPages(mechDir))

      if (pathname === '/pages' && req.method === 'DELETE') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        return json({ success: deletePage(mechDir, pathParam) })
      }

      if (pathname === '/pages/duplicate' && req.method === 'POST') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        if (!body.path || !body.name) return json({ error: 'path and name are required' }, 400)
        try {
          return json(duplicatePage(mechDir, pathParam, body))
        } catch (error) {
          if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
          throw error
        }
      }

      if (pathname === '/pages' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        const pathParam = query.get('path')
        if (pathParam) {
          // Editing an existing page: optionally move it (new path) and/or rename it.
          try {
            const wantsMove = typeof body.path === 'string' && body.path.trim() && body.path.trim() !== pathParam
            const path = wantsMove ? movePage(mechDir, pathParam, body.path).path : pathParam
            if (body.name) renamePage(mechDir, path, body.name)
            return json({ success: true, path })
          } catch (error) {
            if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
            throw error
          }
        }
        if (!body.path || !body.name) return json({ error: 'path and name are required' }, 400)
        try {
          return json(createPage(mechDir, body))
        } catch (error) {
          if (error instanceof PageExistsError) return json({ error: { path: 'Page already exists' } }, 400)
          throw error
        }
      }

      if (pathname === '/save' && req.method === 'POST') {
        const pathParam = query.get('path')
        if (!pathParam) return json({ error: 'Missing path' }, 400)
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        // Optimistic concurrency: the editor sends back the version it loaded.
        // A mismatch means the file changed externally (e.g. Claude edited the
        // .page.md) — reject instead of overwriting; `force: true` overrides.
        if (!body.force && typeof body.version === 'string') {
          const current = pageVersion(mechDir, pathParam)
          if (current != null && current !== body.version) {
            return json({ error: 'conflict', version: current }, 409)
          }
        }
        // The editor pre-splits data into scope buckets; persist each to its store.
        // Page overrides replace the page's data; site/folder merge into shared files.
        const version = savePage(mechDir, pathParam, { content: body.content, data: body.pageData ?? {} })
        mergeSiteData(mechDir, body.siteData ?? {})
        mergeFolderData(mechDir, folderOf(mechDir, pathParam), body.folderData ?? {})
        return json({ success: true, version })
      }

      next()
    } catch (error) {
      json({ error: String(error) }, 500)
    }
  }
}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
