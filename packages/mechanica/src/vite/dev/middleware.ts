import fs from 'node:fs'
import { join } from 'node:path'
import type { Connect } from 'vite'
import { createPage, savePage, updatePageMeta, listPages, listFolders, PageExistsError } from './pages-store'
import { saveUpload, listImages } from './assets-store'
import { resolveDevQuery } from './query-dev'
import { splitDataByScope, mergeSiteData } from './data-store'

/**
 * The `/@mechanica` dev middleware: page CRUD, asset upload/serve, folder list,
 * and query resolution against the local `.mech` store. Mounted under the
 * `/@mechanica` prefix, so `req.url` here is already prefix-stripped.
 */
export function createDevMiddleware(mechDir: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url
    const query = url.searchParams

    const json = (data: unknown, status = 200) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(data))
    }

    try {
      if (pathname.startsWith('/assets/')) {
        const file = join(mechDir, 'assets', decodeURIComponent(pathname.slice('/assets/'.length)))
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          return res.end('Asset not found')
        }
        return fs.createReadStream(file).pipe(res)
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
        const name = (req.headers['x-file-name'] as string) ?? 'file'
        return json(await saveUpload(mechDir, name, body))
      }

      if (pathname === '/pages' && req.method === 'GET') return json(listPages(mechDir))

      if (pathname === '/pages' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf-8'))
        const pathParam = query.get('path')
        if (pathParam) {
          updatePageMeta(mechDir, pathParam, { name: body.name, title: body.title, description: body.description })
          return json({ success: true })
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
        // Route site-scoped data to the shared store; the rest stays on the page.
        const { page, site } = splitDataByScope(body.data ?? {}, body.dataScopes ?? {})
        savePage(mechDir, pathParam, { content: body.content, data: page })
        mergeSiteData(mechDir, site)
        return json({ success: true })
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
