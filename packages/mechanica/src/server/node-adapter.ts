import type { IncomingMessage, ServerResponse } from 'node:http'
import type { EditorService } from './service'

/** A connect-style middleware (what Vite's dev server and Express mount). */
export type NodeMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Mount an {@link EditorService} on a Node HTTP stack. Mount it under the API
 * prefix (`app.use('/@mechanica', …)`) — connect strips the prefix, so
 * `req.url` arrives relative, which is what the service expects. Routes the
 * service doesn't own fall through to `next()`.
 */
export function toNodeMiddleware(service: EditorService): NodeMiddleware {
  return (req, res, next) => {
    void (async () => {
      const method = req.method ?? 'GET'
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) {
        if (value != null) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const request = new Request(new URL(req.url ?? '/', 'http://localhost'), {
        method,
        headers,
        body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
      })

      const response = await service.handle(request)
      if (!response) return next()
      await send(res, response)
    })().catch(next)
  }
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  if (response.body) {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk)
  }
  res.end()
}

/**
 * Serve a site's uploads on a Node HTTP stack. Mount it at the uploads prefix
 * (`app.use('/media', …)`, see `UPLOADS_PREFIX`) — `req.url` then arrives as
 * `/<name>`. A name that is not an upload falls through to `next()`, so files
 * a site keeps in `public/media` are still served by whatever comes after.
 */
export function toAssetMiddleware(service: EditorService): NodeMiddleware {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    void (async () => {
      const name = (req.url ?? '/').split('?')[0]!.slice(1)
      const response = name ? await service.asset(name) : null
      if (!response) return next()
      await send(res, response)
    })().catch(next)
  }
}
