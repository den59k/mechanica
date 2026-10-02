import { getToken } from './credentials'

/** A failed platform request: the HTTP status plus the message the platform gave. */
export class PlatformError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The platform answers errors as plain text or as `{ error: { field: { message } } }`. */
function errorMessage(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text)
    const error = parsed?.error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
      const messages = Object.values(error)
        .map((item: any) => item?.message)
        .filter((message): message is string => typeof message === 'string')
      if (messages.length) return messages.join('; ')
    }
  } catch {
    // Not JSON — the text is the message.
  }
  return text.trim() || `Request failed (${status})`
}

export interface RequestOptions {
  token?: string | null
  /** A JSON body… */
  body?: unknown
  /** …or raw bytes (a bundle). */
  raw?: Uint8Array
}

/** One request to the platform API; resolves with the parsed JSON body (or null). */
export async function request<T = any>(
  origin: string,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.raw) headers['content-type'] = 'application/octet-stream'
  else if (options.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(origin + path, {
      method,
      headers,
      // The DOM lib's BodyInit does not list a plain Uint8Array, though fetch takes one.
      body: (options.raw as BodyInit | undefined) ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    })
  } catch (error) {
    throw new PlatformError(0, `Could not reach ${origin} (${(error as Error).message})`)
  }

  const text = await response.text()
  if (!response.ok) throw new PlatformError(response.status, errorMessage(response.status, text))
  return (text ? JSON.parse(text) : null) as T
}

/** The saved token for `origin`, or an error telling the user to log in. */
export async function requireToken(origin: string): Promise<string> {
  const token = await getToken(origin)
  if (!token) throw new Error(`Not logged in to ${origin} — run \`mechanica login\` first`)
  return token
}

export interface PlatformSite {
  uuid: string
  slug: string
  name: string
  role: string
  gitUrl: string
}

/** The name of the git remote `mechanica link` manages. */
export const REMOTE_NAME = 'mechanica'

/**
 * Split a site's git remote URL (`https://host/git/<slug>.git`) into the
 * platform origin and the slug; null for a URL that is not one of ours.
 */
export function parseRemoteUrl(url: string): { origin: string; slug: string } | null {
  try {
    const parsed = new URL(url)
    const match = /^\/git\/([a-z0-9][a-z0-9-]*[a-z0-9])\.git\/?$/.exec(parsed.pathname)
    if (!match || !/^https?:$/.test(parsed.protocol)) return null
    return { origin: parsed.origin, slug: match[1]! }
  } catch {
    return null
  }
}
