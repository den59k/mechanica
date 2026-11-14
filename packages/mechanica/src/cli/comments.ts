import fs from 'node:fs'
import { join, relative } from 'node:path'
import {
  anchorForBlock,
  resolveAnchor,
  type BlockPathSegment,
  type CommentAnchor,
  type CommentAuthor,
  type CommentThread,
  type ContentBlock,
} from 'mechanica-shared'
import { parsePage } from 'mechanica-shared/page-format'
import { getPagePath } from '../server/pages-store'
import {
  fsCommentStore,
  localCommentAuthor,
  normalizeCommentPage,
  type CommentStore,
} from '../server/comments-store'

export interface CommentsOptions {
  /** Project root (defaults to the current working directory). */
  cwd?: string
  /** Where the comments are (defaults to `<cwd>/.mech/comments/`). */
  store?: CommentStore
  /** Where the output goes (defaults to `console.info`). */
  log?: (text: string) => void
  /** The environment the author is read from (defaults to `process.env`). */
  env?: Record<string, string | undefined>
  /** `--page </path>`: list one page's threads. */
  page?: string
  /** `--all`: list resolved threads too. */
  all?: boolean
  /** `--json`: list as JSON. */
  json?: boolean
  /** `--block <id>`: the content block `add` pins the thread to. */
  block?: string
  /** `--locale <code>`: the translation `add` comments on. */
  locale?: string
  /** `--note "…"`: what was done, posted as a reply before `resolve`. */
  note?: string
  /** `--as <name>`: write as this person. */
  as?: string
}

/**
 * Where a thread points in the project as it is now. `line`, `blockId` and
 * `blockType` are null for a thread on the whole page, and for one whose block
 * is no longer on the page.
 */
export interface CommentLocation {
  /** The page file, relative to the project root, with forward slashes. */
  file: string
  /** The 1-based line of the block's open fence. */
  line: number | null
  /** The block's content-block id now — it may differ from the anchor's. */
  blockId: string | null
  blockType: string | null
}

const USAGE = `Usage:
  mechanica comments [--page </path>] [--all] [--json]
  mechanica comments add </page> "text" [--block <content-block-id>] [--locale <code>]
  mechanica comments reply <id> "text"
  mechanica comments resolve <id> [--note "what was done"]
  mechanica comments reopen <id>`

/**
 * Who writes a comment from the CLI: `--as <name>`, else Claude when a Claude
 * Code session runs the command, else the person at this machine.
 */
export function cliCommentAuthor(
  options: { as?: string; cwd?: string; env?: Record<string, string | undefined> } = {},
): CommentAuthor {
  const name = options.as?.trim()
  if (name) return { name, kind: 'user' }
  if ((options.env ?? process.env).CLAUDECODE) return { name: 'Claude', kind: 'agent' }
  return localCommentAuthor(options.cwd)
}

interface ParsedPageFile {
  file: string
  content: ContentBlock[]
  /** The open-fence line of each block, by content-block id. */
  lines: Map<string, number>
}

/** Read and parse a page file; null when it is missing or does not parse. */
function parsePageFile(file: string): ParsedPageFile | null {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  const lines = new Map<string, number>()
  try {
    const { content } = parsePage(text, { onBlock: (block, line) => void lines.set(block.id, line) })
    return { file, content, lines }
  } catch {
    return null
  }
}

/**
 * Find a thread's block in the page file as it is now. The default-locale file
 * owns the block structure, so the anchor is resolved against it; a thread made
 * on a translation points into the translation file when the block is there.
 * Null when the page has no (readable) file.
 */
export function locateComment(cwd: string, thread: CommentThread): CommentLocation | null {
  const mechDir = join(cwd, '.mech')
  const rel = (file: string): string => relative(cwd, file).replace(/\\/g, '/')
  const base = parsePageFile(getPagePath(mechDir, thread.page))
  if (!base) return null
  const translation = thread.locale ? parsePageFile(getPagePath(mechDir, thread.page, thread.locale)) : null
  const pageFile = rel((translation ?? base).file)

  const found = thread.anchor ? resolveAnchor(base.content, thread.anchor) : null
  if (!found) return { file: pageFile, line: null, blockId: null, blockType: null }

  const { id, blockId: blockType } = found.block
  const inTranslation = translation?.lines.get(id)
  if (translation && inTranslation !== undefined) {
    return { file: rel(translation.file), line: inTranslation, blockId: id, blockType }
  }
  return { file: rel(base.file), line: base.lines.get(id) ?? null, blockId: id, blockType }
}

/** `2026-11-14T10:32:05.000Z` → `2026-11-14 10:32` (UTC). */
const shortDate = (iso: string): string => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(iso) ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso)

const authorLabel = (author: CommentAuthor | undefined): string => author?.name || 'Someone'

/** `[2, 'start', 0]` → `3 › start › 1`: where a block was, counted the way a person counts. */
const describePath = (path: BlockPathSegment[]): string =>
  path.map((segment) => (typeof segment === 'number' ? String(segment + 1) : segment)).join(' › ')

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const quoteLines = (text: string, prefix: string): string[] => text.split('\n').map((line) => (prefix + line).trimEnd())

/** The URL path `mechanica shot` takes for a thread's page: translations live under `/<locale>`. */
const shotPath = (thread: CommentThread): string =>
  thread.locale ? `/${thread.locale}${thread.page === '/' ? '' : thread.page}` : thread.page

/** `h2.hero__title` "Build Vue sites…": the clicked element, greppable in the component and the page file. */
function describeElement(element: NonNullable<CommentAnchor['element']>): string {
  const selector = [element.tag, ...(element.classes ?? [])].join('.')
  return `\`${selector}\`${element.text ? ` "${element.text.replace(/\s+/g, ' ')}"` : ''}`
}

function formatThread(thread: CommentThread, location: CommentLocation | null, showStatus: boolean): string[] {
  const [first, ...replies] = thread.messages
  const anchor = thread.anchor
  const out: string[] = []

  const heading = [thread.id]
  if (showStatus) heading.push(thread.status)
  heading.push(authorLabel(first?.author), shortDate(first?.createdAt ?? thread.createdAt))
  if (thread.locale) heading.push(`locale ${thread.locale}`)
  out.push(`### ${heading.join(' · ')}`)

  const file = location ? `\`${location.file}\`` : 'the page has no file any more'
  if (!anchor) {
    out.push(`Whole page — ${file}`)
  } else if (location?.blockId) {
    const where = location.line ? `${location.file}:${location.line}` : location.file
    out.push(`\`${location.blockType}\` block \`#${location.blockId}\` — ${where}`)
  } else {
    out.push(
      `Block not found on the page any more — was \`${anchor.blockType}\` \`#${anchor.blockId}\` at position ${describePath(anchor.path)} (${file})`,
    )
  }

  if (anchor) {
    const details: string[] = []
    if (anchor.element) details.push(`Element: ${describeElement(anchor.element)}`)
    if (anchor.field) details.push(`Field: \`${anchor.field}\``)
    if (anchor.quote) details.push(`Quote: "${anchor.quote.replace(/\s+/g, ' ')}"`)
    if (anchor.viewport) details.push(`Viewport: ${anchor.viewport}px`)
    if (details.length) out.push(details.join(' · '))
  }

  out.push('')
  if (first) out.push(...quoteLines(first.body, '> '))
  for (const reply of replies) {
    const [head, ...rest] = reply.body.split('\n')
    out.push(`  ↳ ${authorLabel(reply.author)}: ${head}`)
    if (rest.length) out.push(...quoteLines(rest.join('\n'), '    '))
  }
  if (thread.status === 'resolved' && showStatus) {
    out.push(`  ✓ Resolved by ${authorLabel(thread.resolvedBy)}${thread.resolvedAt ? `, ${shortDate(thread.resolvedAt)}` : ''}`)
  }

  if (location) {
    let shot = `mechanica shot ${shotPath(thread)}`
    if (anchor && location.blockId) shot += ` --section "#${location.blockId}"`
    if (anchor?.viewport) shot += ` --width ${anchor.viewport}`
    // The click point, drawn on the picture: where in the block the comment is.
    const marked = !!anchor && !!location.blockId && anchor.x != null && anchor.y != null
    if (marked) shot += ` --mark ${anchor.x},${anchor.y}`
    out.push('', `See it: \`${shot}\`${marked ? ' (a ring marks the commented spot)' : ''}`)
  }
  return out
}

/**
 * The Markdown digest `mechanica comments` prints: everything a coding agent
 * needs to act on the threads without opening the editor — who said what, about
 * which block, and where that block is in the project now. `locate` answers
 * the last part (see {@link locateComment}). Statuses are shown when
 * `showStatus` is set — a listing with resolved threads in it.
 */
export function formatCommentsDigest(
  threads: CommentThread[],
  locate: (thread: CommentThread) => CommentLocation | null,
  options: { showStatus?: boolean } = {},
): string {
  const showStatus = options.showStatus === true
  if (threads.length === 0) return showStatus ? 'No comments.' : 'No open comments.'

  const countOf = (list: CommentThread[]): string => {
    const open = list.filter((thread) => thread.status === 'open').length
    const resolved = list.length - open
    return resolved ? `${open} open, ${resolved} resolved` : `${open} open`
  }

  const pages = new Map<string, CommentThread[]>()
  for (const thread of threads) {
    if (!pages.has(thread.page)) pages.set(thread.page, [])
    pages.get(thread.page)!.push(thread)
  }

  const out: string[] = [`# Review comments — ${countOf(threads)} on ${plural(pages.size, 'page')}`]
  for (const [page, list] of pages) {
    out.push('', `## ${page} — ${countOf(list)}`)
    for (const thread of list) out.push('', ...formatThread(thread, locate(thread), showStatus))
  }
  out.push(
    '',
    '---',
    'When a comment is dealt with: `mechanica comments resolve <id> --note "what changed"`. To ask or answer without closing it: `mechanica comments reply <id> "…"`.',
  )
  return out.join('\n')
}

/**
 * `mechanica comments` — the review comments people leave in the editor, for
 * whoever fixes the pages (a coding agent, mostly): list them with the file and
 * line of each block, answer, resolve.
 */
export async function runComments(args: string[], options: CommentsOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const mechDir = join(cwd, '.mech')
  const store = options.store ?? fsCommentStore(mechDir)
  const log = options.log ?? ((text: string) => console.info(text))
  const author = (): CommentAuthor => cliCommentAuthor({ as: options.as, cwd, env: options.env })

  const [action, ...rest] = args
  const existing = async (id: string | undefined): Promise<CommentThread> => {
    if (!id) throw new Error(USAGE)
    const thread = await store.get(id)
    if (!thread) throw new Error(`No comment thread "${id}" — \`mechanica comments --all\` lists them`)
    return thread
  }
  const textOf = (value: string | undefined, what: string): string => {
    const text = value?.trim()
    if (!text) throw new Error(`${what}\n\n${USAGE}`)
    return text
  }

  if (action === undefined || action === 'list') {
    const filter = options.page ? { page: options.page } : {}
    const threads = (await store.list(filter)).filter((thread) => options.all || thread.status === 'open')
    const locate = (thread: CommentThread): CommentLocation | null => locateComment(cwd, thread)
    if (options.json) {
      log(JSON.stringify(threads.map((thread) => ({ ...thread, location: locate(thread) })), null, 2))
      return
    }
    if (threads.length === 0) {
      const scope = options.page ? ` on ${normalizeCommentPage(options.page)}` : ''
      log(options.all ? `No comments${scope}.` : `No open comments${scope}.`)
      return
    }
    log(formatCommentsDigest(threads, locate, { showStatus: options.all }))
    return
  }

  if (action === 'add') {
    if (!rest[0]) throw new Error(USAGE)
    const page = normalizeCommentPage(rest[0])
    const body = textOf(rest[1], 'A comment needs some text.')
    const base = parsePageFile(getPagePath(mechDir, page))
    if (!base) throw new Error(`No page "${page}" in this project (or its file does not parse)`)
    let anchor
    if (options.block) {
      anchor = anchorForBlock(base.content, options.block)
      if (!anchor) {
        const ids = [...base.lines.keys()].map((id) => `#${id}`).join(', ')
        throw new Error(`No block "#${options.block}" on ${page}${ids ? ` — its blocks: ${ids}` : ''}`)
      }
    }
    const thread = await store.create(
      { page, body, ...(options.locale ? { locale: options.locale } : {}), ...(anchor ? { anchor } : {}) },
      author(),
    )
    log(`Added ${thread.id} on ${page}${anchor ? ` (\`${anchor.blockType}\` #${anchor.blockId})` : ''}`)
    return
  }

  if (action === 'reply') {
    const thread = await existing(rest[0])
    await store.reply(thread.id, textOf(rest[1], 'A reply needs some text.'), author())
    log(`Replied to ${thread.id}`)
    return
  }

  if (action === 'resolve') {
    const thread = await existing(rest[0])
    const note = options.note?.trim()
    // One write: the note and the status land together (see `CommentStore.setStatus`).
    await store.setStatus(thread.id, 'resolved', author(), note)
    log(thread.status === 'resolved' && !note ? `${thread.id} was already resolved` : `Resolved ${thread.id}`)
    return
  }

  if (action === 'reopen') {
    const thread = await existing(rest[0])
    await store.setStatus(thread.id, 'open', author())
    log(thread.status === 'open' ? `${thread.id} is already open` : `Reopened ${thread.id}`)
    return
  }

  throw new Error(`Unknown comments command "${action}"\n\n${USAGE}`)
}
