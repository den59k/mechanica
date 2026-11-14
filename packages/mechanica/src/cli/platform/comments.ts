import { join } from 'node:path'
import type { CommentAuthor, CommentThread } from 'mechanica-shared'
import { fsCommentStore, normalizeCommentPage, type CommentStore } from '../../server/comments-store'
import { isOutage, PlatformError, request } from './api'
import { lookupLink, type LinkLookup, type SiteLink } from './assets'

/*
 * A linked project's review comments are the platform's: the threads people
 * leave in the online editor are the ones the local editor shows and
 * `mechanica comments` reads and answers. The API below has a mirror
 * implementation on the platform — change both together.
 */

/** Where a project's comments are kept: the site it is linked to, or `.mech/comments/`. */
export type CommentSource = { kind: 'platform'; origin: string; slug: string } | { kind: 'local' }

/** A project's comment store, which can say where the comments are. */
export interface ProjectCommentStore extends CommentStore {
  /** Which store the project resolved to. Never rejects. */
  describe(): Promise<CommentSource>
}

export interface RemoteCommentOptions {
  /** The `fetch` requests go through (defaults to the global one). */
  fetch?: typeof fetch
}

/** The one thing the platform is told about an author: whether a coding agent wrote on the account's behalf. */
const agentFlag = (author: CommentAuthor): { agent: boolean } => ({ agent: author.kind === 'agent' })

/**
 * A site's comments on the platform. The platform names the author from the
 * token; of the `author` / `by` arguments only the kind travels (`agent`).
 * Failures reject with a `PlatformError` carrying the platform's message.
 */
export function remoteCommentStore(link: SiteLink, options: RemoteCommentOptions = {}): CommentStore {
  const base = `/api/sites/${link.uuid}/comments`
  const send = <T>(method: string, path: string, body?: unknown): Promise<T> =>
    request<T>(link.origin, method, path, {
      token: link.token,
      ...(body !== undefined ? { body } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
  /** A write to one thread: the platform answers 404 when there is no such thread. */
  const onThread = async (path: string, body: unknown): Promise<CommentThread | null> => {
    try {
      return await send<CommentThread>('POST', path, body)
    } catch (error) {
      if (error instanceof PlatformError && error.status === 404) return null
      throw error
    }
  }

  const list = async (filter: { page?: string } = {}): Promise<CommentThread[]> => {
    const query = filter.page === undefined ? '' : `?page=${encodeURIComponent(normalizeCommentPage(filter.page))}`
    const threads = await send<CommentThread[]>('GET', base + query)
    if (!Array.isArray(threads)) throw new PlatformError(502, `${link.origin} did not answer with a list of comments`)
    return threads
  }

  return {
    list,
    async get(id) {
      return (await list()).find((thread) => thread.id === id) ?? null
    },
    create: (input, author) =>
      send<CommentThread>('POST', base, {
        page: input.page,
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.anchor ? { anchor: input.anchor } : {}),
        body: input.body,
        ...agentFlag(author),
      }),
    reply: (id, body, author) => onThread(`${base}/reply`, { id, body, ...agentFlag(author) }),
    setStatus: (id, status, by, note) =>
      onThread(`${base}/status`, { id, status, ...(note?.trim() ? { note } : {}), ...agentFlag(by) }),
    async remove(id) {
      const answer = await send<{ success?: boolean } | null>('DELETE', `${base}?id=${encodeURIComponent(id)}`)
      return answer?.success === true
    },
    // A page moved or deleted in this checkout reaches the platform with
    // `mechanica push`, not from here — and the platform moves and removes the
    // comments itself when a page is moved or deleted in its editor.
    async movePage() {},
    async removePage() {},
  }
}

export interface CommentStoreForOptions extends RemoteCommentOptions {
  /** How the project's link is found (defaults to `lookupLink`). */
  lookupLink?: (cwd: string) => Promise<LinkLookup>
}

/**
 * The site a linked project keeps its comments on did not answer. Nothing was
 * read or written — in particular not `.mech/comments/`, which nobody on the
 * site would ever see.
 */
export class CommentsUnreachableError extends PlatformError {
  source: CommentSource
  constructor(site: { origin: string; slug: string }, cause: PlatformError) {
    super(
      cause.status,
      `${cause.message}. This project’s comments are kept on ${site.origin} (${site.slug}), so nothing was read or written; ` +
        '`mechanica comments --local` works on .mech/comments/ instead.',
    )
    this.source = { kind: 'platform', origin: site.origin, slug: site.slug }
  }
}

/**
 * The store a project's comments live in — resolved lazily: the site the
 * project is linked to when it has comments, else `<cwd>/.mech/comments/` (not
 * linked, not logged in, or a platform that predates comments — it answers the
 * first list with a 404). Creating it never throws and asks nothing.
 *
 * The answer is kept for the life of the store, with one exception: a linked
 * project whose platform does not answer. That is not an answer — every use
 * rejects with a {@link CommentsUnreachableError} and the next one asks again,
 * so a dev server started offline finds the site's comments once it is back.
 */
export function commentStoreFor(cwd: string, options: CommentStoreForOptions = {}): ProjectCommentStore {
  type Target = { source: CommentSource; store: CommentStore }
  const local = (): Target => ({ source: { kind: 'local' }, store: fsCommentStore(join(cwd, '.mech')) })

  const resolve = async (): Promise<Target> => {
    let found: LinkLookup
    try {
      found = await (options.lookupLink ?? lookupLink)(cwd)
    } catch {
      found = { state: 'none' }
    }
    if (found.state === 'none') return local()
    if (found.state === 'unreachable') throw new CommentsUnreachableError(found, found.error)
    const { link } = found
    const store = remoteCommentStore(link, options)
    try {
      await store.list()
    } catch (error) {
      if (isOutage(error)) throw new CommentsUnreachableError(link, error)
      // No comments API there: an older platform, or something else entirely
      // answered. Any other refusal is the platform's to explain when the
      // comments are used: falling back to a file nobody else reads would hide it.
      if (!(error instanceof PlatformError) || error.status === 404) return local()
    }
    return { source: { kind: 'platform', origin: link.origin, slug: link.slug }, store }
  }

  let resolved: Promise<Target> | null = null
  const target = (): Promise<Target> => {
    if (!resolved) {
      const attempt = (resolved = resolve())
      // An outage is not remembered: the next use asks again.
      attempt.catch(() => {
        if (resolved === attempt) resolved = null
      })
    }
    return resolved
  }
  const store = async (): Promise<CommentStore> => (await target()).store
  // A page moved or deleted here is the platform's to follow (see
  // `remoteCommentStore`), so an outage must not fail the move itself.
  const storeIfReachable = (): Promise<CommentStore | null> =>
    store().catch((error) => {
      if (error instanceof CommentsUnreachableError) return null
      throw error
    })

  return {
    describe: () =>
      target().then(
        (found) => found.source,
        (error): CommentSource => (error instanceof CommentsUnreachableError ? error.source : { kind: 'local' }),
      ),
    list: async (filter) => (await store()).list(filter),
    get: async (id) => (await store()).get(id),
    create: async (input, author) => (await store()).create(input, author),
    reply: async (id, body, author) => (await store()).reply(id, body, author),
    setStatus: async (id, status, by, note) => (await store()).setStatus(id, status, by, note),
    remove: async (id) => (await store()).remove(id),
    movePage: async (from, to) => (await storeIfReachable())?.movePage(from, to),
    removePage: async (page) => (await storeIfReachable())?.removePage(page),
  }
}
