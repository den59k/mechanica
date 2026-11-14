import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type {
  BlockPathSegment,
  CommentAnchor,
  CommentAuthor,
  CommentMessage,
  CommentStatus,
  CommentThread,
  NewCommentRequest,
} from 'mechanica-shared'
import { writeFileAtomic } from './fs-utils'

/**
 * Where a site's review comments live. They are workflow state, not content:
 * they never pass through `ContentFiles` (on a hosted site that path ends in
 * git) and never reach a page file. A directory keeps them in
 * `comments/comments.json` ({@link fsCommentStore}); a host with a database
 * implements the same interface over it.
 */
export interface CommentStore {
  /** Threads of one page, or of the whole site; oldest first. */
  list(filter?: { page?: string }): Promise<CommentThread[]>
  get(id: string): Promise<CommentThread | null>
  create(input: NewCommentRequest, author: CommentAuthor): Promise<CommentThread>
  /** null when there is no such thread. */
  reply(id: string, body: string, author: CommentAuthor): Promise<CommentThread | null>
  /**
   * `note` is a reply posted together with the change ("what was done") — one
   * write, so nobody ever sees the note without the new status.
   */
  setStatus(id: string, status: CommentStatus, by: CommentAuthor, note?: string): Promise<CommentThread | null>
  remove(id: string): Promise<boolean>
  /** A page moved: its threads follow it. */
  movePage(from: string, to: string): Promise<void>
  /** A page was deleted: so are its threads. */
  removePage(page: string): Promise<void>
}

/** The comments directory inside `.mech`, and the file in it. */
export const COMMENTS_DIR = 'comments'
export const COMMENTS_FILE = 'comments/comments.json'

/** A page path as threads are stored and filtered by: a leading slash, no trailing one (the root is `/`). */
export function normalizeCommentPage(page: string): string {
  return '/' + page.trim().replace(/^\/+|\/+$/g, '')
}

export const isCommentStatus = (value: unknown): value is CommentStatus => value === 'open' || value === 'resolved'

const isSegment = (value: unknown): value is BlockPathSegment =>
  typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value) && value >= 0)

/**
 * An anchor as it is stored: the known fields only, each of the right type.
 * Null when the value is not an anchor at all (no block id, type or position).
 */
export function cleanCommentAnchor(value: unknown): CommentAnchor | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.blockId !== 'string' || raw.blockId === '') return null
  if (typeof raw.blockType !== 'string' || raw.blockType === '') return null
  if (!Array.isArray(raw.path) || raw.path.length === 0 || !raw.path.every(isSegment)) return null
  const anchor: CommentAnchor = { blockId: raw.blockId, blockType: raw.blockType, path: [...raw.path] }
  if (typeof raw.field === 'string' && raw.field !== '') anchor.field = raw.field
  if (typeof raw.quote === 'string' && raw.quote !== '') anchor.quote = raw.quote
  const element = cleanElement(raw.element)
  if (element) anchor.element = element
  if (typeof raw.x === 'number' && Number.isFinite(raw.x)) anchor.x = raw.x
  if (typeof raw.y === 'number' && Number.isFinite(raw.y)) anchor.y = raw.y
  if (typeof raw.viewport === 'number' && Number.isFinite(raw.viewport)) anchor.viewport = raw.viewport
  return anchor
}

/** The clicked element as stored: a tag, a few classes, a capped text — or nothing. */
function cleanElement(value: unknown): CommentAnchor['element'] | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.tag !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(raw.tag)) return null
  const element: NonNullable<CommentAnchor['element']> = { tag: raw.tag.toLowerCase() }
  if (Array.isArray(raw.classes)) {
    const classes = raw.classes
      .filter((name): name is string => typeof name === 'string' && /^\S{1,80}$/.test(name))
      .slice(0, 8)
    if (classes.length) element.classes = classes
  }
  if (typeof raw.text === 'string' && raw.text.trim() !== '') element.text = raw.text.trim().slice(0, 200)
  return element
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function randomId(prefix: string, taken: Set<string>): string {
  for (;;) {
    let id = prefix
    for (const byte of randomBytes(8)) id += ID_ALPHABET[byte % ID_ALPHABET.length]
    if (!taken.has(id)) return id
  }
}

const takenIds = (threads: CommentThread[]): Set<string> => {
  const ids = new Set<string>()
  for (const thread of threads) {
    ids.add(thread.id)
    for (const message of thread.messages) ids.add(message.id)
  }
  return ids
}

const cleanAuthor = ({ name, kind, id }: CommentAuthor): CommentAuthor => ({
  name,
  kind: kind === 'agent' ? 'agent' : 'user',
  ...(id !== undefined ? { id } : {}),
})

function cleanBody(body: unknown): string {
  const text = typeof body === 'string' ? body.replace(/\r\n/g, '\n').trim() : ''
  if (!text) throw new Error('A comment needs some text')
  return text
}

/** Where a store keeps its threads. `write` is only ever handed what `read` returned, changed. */
interface ThreadsIo {
  read(): CommentThread[]
  write(threads: CommentThread[]): void
}

/**
 * The store logic over a place to keep the threads. Every operation reads,
 * changes and writes in one synchronous step, so two operations in a process
 * never interleave, and nothing is remembered between them.
 */
function commentStoreOver(io: ThreadsIo): CommentStore {
  /** Change one thread in place; false from `change` means "nothing to write". */
  const update = (id: string, change: (thread: CommentThread, all: CommentThread[]) => boolean | void) => {
    const threads = io.read()
    const thread = threads.find((item) => item.id === id)
    if (!thread) return null
    if (change(thread, threads) !== false) io.write(threads)
    return thread
  }

  return {
    async list(filter = {}) {
      const threads = io.read()
      if (filter.page === undefined) return threads
      const page = normalizeCommentPage(filter.page)
      return threads.filter((thread) => thread.page === page)
    },

    async get(id) {
      return io.read().find((thread) => thread.id === id) ?? null
    },

    async create(input, author) {
      const body = cleanBody(input.body)
      if (typeof input.page !== 'string' || input.page.trim() === '') throw new Error('A comment needs a page')
      const anchor = input.anchor == null ? null : cleanCommentAnchor(input.anchor)
      if (input.anchor != null && !anchor) throw new Error('Invalid comment anchor')

      const threads = io.read()
      const taken = takenIds(threads)
      const createdAt = new Date().toISOString()
      const thread: CommentThread = {
        id: randomId('c_', taken),
        page: normalizeCommentPage(input.page),
        ...(typeof input.locale === 'string' && input.locale !== '' ? { locale: input.locale } : {}),
        ...(anchor ? { anchor } : {}),
        status: 'open',
        messages: [{ id: randomId('m_', taken), author: cleanAuthor(author), body, createdAt }],
        createdAt,
      }
      threads.push(thread)
      io.write(threads)
      return thread
    },

    async reply(id, rawBody, author) {
      const body = cleanBody(rawBody)
      return update(id, (thread, all) => {
        const message: CommentMessage = {
          id: randomId('m_', takenIds(all)),
          author: cleanAuthor(author),
          body,
          createdAt: new Date().toISOString(),
        }
        thread.messages.push(message)
      })
    },

    async setStatus(id, status, by, note) {
      if (!isCommentStatus(status)) throw new Error(`Unknown comment status "${String(status)}"`)
      const body = note?.trim() ? cleanBody(note) : null
      return update(id, (thread, all) => {
        if (thread.status === status && !body) return false
        if (body) {
          thread.messages.push({
            id: randomId('m_', takenIds(all)),
            author: cleanAuthor(by),
            body,
            createdAt: new Date().toISOString(),
          })
        }
        if (thread.status === status) return
        thread.status = status
        if (status === 'resolved') {
          thread.resolvedAt = new Date().toISOString()
          thread.resolvedBy = cleanAuthor(by)
        } else {
          delete thread.resolvedAt
          delete thread.resolvedBy
        }
      })
    },

    async remove(id) {
      const threads = io.read()
      const kept = threads.filter((thread) => thread.id !== id)
      if (kept.length === threads.length) return false
      io.write(kept)
      return true
    },

    async movePage(from, to) {
      const source = normalizeCommentPage(from)
      const target = normalizeCommentPage(to)
      if (source === target) return
      const threads = io.read()
      let moved = false
      for (const thread of threads) {
        if (thread.page !== source) continue
        thread.page = target
        moved = true
      }
      if (moved) io.write(threads)
    },

    async removePage(page) {
      const target = normalizeCommentPage(page)
      const threads = io.read()
      const kept = threads.filter((thread) => thread.page !== target)
      if (kept.length !== threads.length) io.write(kept)
    },
  }
}

/** The threads of a parsed comments file; anything that is not a thread is dropped. */
function threadsOf(parsed: unknown): CommentThread[] {
  const list = (parsed as { threads?: unknown } | null)?.threads
  if (!Array.isArray(list)) return []
  return list.filter(
    (item): item is CommentThread =>
      !!item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.page === 'string' &&
      Array.isArray(item.messages),
  )
}

/**
 * Comments in a `.mech` directory: `comments/comments.json`. The file is read
 * and rewritten on every operation, never cached — the dev server and the CLI
 * are separate processes on the same file. A missing or unreadable file is a
 * site without comments.
 *
 * The directory ignores itself (`comments/.gitignore`), so comments stay out of
 * git without the project's own `.gitignore` being touched. It is written once,
 * with the directory; delete it to track comments.
 */
export function fsCommentStore(mechDir: string): CommentStore {
  const dir = join(mechDir, COMMENTS_DIR)
  const file = join(mechDir, COMMENTS_FILE)
  return commentStoreOver({
    read() {
      try {
        return threadsOf(JSON.parse(fs.readFileSync(file, 'utf-8')))
      } catch {
        return []
      }
    },
    write(threads) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(join(dir, '.gitignore'), '*\n')
      }
      writeFileAtomic(file, JSON.stringify({ version: 1, threads }, null, 2) + '\n')
    },
  })
}

/** Comments held in memory — for tests, and for a host that keeps them elsewhere and seeds a session. */
export function memoryCommentStore(initial: CommentThread[] = []): CommentStore {
  // Stored as text, like the file: nothing a caller holds is shared with the store.
  let text = JSON.stringify(initial)
  return commentStoreOver({
    read: () => JSON.parse(text) as CommentThread[],
    write(threads) {
      text = JSON.stringify(threads)
    },
  })
}

/**
 * The person at this machine, as a comment author: the git user name of `cwd`,
 * else the OS user name, else "You".
 */
export function localCommentAuthor(cwd?: string): CommentAuthor {
  let name = ''
  try {
    name = execFileSync('git', ['config', 'user.name'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim()
  } catch {
    /* no git, no repository, no name set */
  }
  if (!name) {
    try {
      name = os.userInfo().username.trim()
    } catch {
      /* no user database entry (a container) */
    }
  }
  return { name: name || 'You', kind: 'user' }
}
