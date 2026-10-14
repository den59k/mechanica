import { findDevServer } from './headless'

export interface ResolvedServer {
  origin: string
  close: () => Promise<void>
}

/**
 * Find a dev server to render against: an explicit origin, a running local
 * Mechanica dev server, or an ephemeral one booted from the project's
 * `vite.config.ts` and torn down afterwards.
 *
 * The only browser-side helper that needs Vite, kept out of `headless.ts` so
 * the public `mechanica/browser` entry never pulls it in.
 */
export async function resolveServer(flag?: string): Promise<ResolvedServer> {
  if (flag) return { origin: flag.replace(/\/+$/, ''), close: async () => {} }

  const running = await findDevServer()
  if (running) return { origin: running, close: async () => {} }

  console.info('No running dev server found — starting one…')
  const { createServer } = await import('vite')
  const server = await createServer({ logLevel: 'warn' })
  await server.listen()
  const origin = server.resolvedUrls?.local[0]?.replace(/\/+$/, '')
  if (!origin) {
    await server.close()
    throw new Error('Failed to start a dev server (no resolved URL)')
  }
  return { origin, close: () => server.close() }
}
