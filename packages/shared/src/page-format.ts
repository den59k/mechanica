import { Document, isCollection, isMap, isScalar, isSeq, parse as parseYaml } from 'yaml'
import type { ContentBlock } from './types'

/**
 * A parsed page document — the page envelope (everything but `content`) plus the
 * content tree. This is the in-memory shape the `.page.md` codec maps to/from;
 * it mirrors the dev store's `PageFile`.
 */
export interface PageDoc {
  name?: string
  meta?: Record<string, unknown>
  /** Page-scoped data overrides (defineData). */
  data: Record<string, unknown>
  content: ContentBlock[]
  order?: number
  orderAfter?: string | null
  path?: string
}

/** Thrown by {@link parsePage} with the 1-based source line of the problem. */
export class PageParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(`${message} (line ${line})`)
    this.name = 'PageParseError'
    Object.setPrototypeOf(this, PageParseError.prototype)
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────────
// Structural tokens are recognized ONLY at column 0 (no leading whitespace), so
// indented YAML block-scalar / nested-mapping content in a head is never mistaken
// for a fence. Nesting comes from `:::` pairing, not indentation.

type Token =
  | { kind: 'open'; blockId: string; rest: string }
  | { kind: 'close'; id?: string }
  | { kind: 'field'; name: string }

const CLOSE_BARE = /^:::[ \t]*$/
const CLOSE_LABELED = /^:::[ \t]*\/[ \t]*([A-Za-z][\w-]*)?[ \t]*$/
const OPEN = /^:::[ \t]+([A-Za-z][\w-]*)[ \t]*(.*)$/
const FIELD = /^@([A-Za-z][\w.-]*)[ \t]*$/

/** Classify a line as a structural token, or null when it's head/region content. */
function classify(line: string): Token | null {
  if (/^[ \t]/.test(line)) return null // indented → content, never a token
  let m: RegExpExecArray | null
  if (CLOSE_BARE.test(line)) return { kind: 'close' }
  if ((m = CLOSE_LABELED.exec(line))) return { kind: 'close', id: m[1] || undefined }
  if ((m = OPEN.exec(line))) return { kind: 'open', blockId: m[1]!, rest: m[2]! }
  if ((m = FIELD.exec(line))) return { kind: 'field', name: m[1]! }
  return null
}

/** Leading run of backticks/tildes that opens or closes a Markdown code fence. */
function matchFence(line: string): string | null {
  const m = /^[ \t]*([`~]{3,})/.exec(line)
  return m ? m[1]! : null
}

/** Strip the common leading indentation from a block of lines (blank lines ignored). */
function dedent(lines: string[]): string[] {
  let min = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    min = Math.min(min, /^[ \t]*/.exec(line)![0].length)
  }
  if (!isFinite(min) || min === 0) return lines.slice()
  return lines.map((line) => (line.trim() === '' ? line.trimStart() : line.slice(min)))
}

/** Set `data[a.b.c] = value`, creating intermediate objects. */
function setPath(data: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let target = data
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {}
    target = target[key] as Record<string, unknown>
  }
  target[parts[parts.length - 1]!] = value
}

interface Frame {
  block: ContentBlock
  headBuf: string[]
  region: { name: string; lines: string[]; fence: string | null } | null
}

/** Parse a `.page.md` document into a {@link PageDoc}. */
export function parsePage(text: string): PageDoc {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  // 1. Frontmatter (the page envelope).
  let envelope: Record<string, unknown> = {}
  if (lines[0] === '---') {
    let j = 1
    while (j < lines.length && lines[j] !== '---') j++
    if (j >= lines.length) throw new PageParseError('Unterminated frontmatter (missing closing ---)', 1)
    try {
      envelope = (parseYaml(lines.slice(1, j).join('\n')) as Record<string, unknown>) ?? {}
    } catch (error) {
      throw new PageParseError(`Invalid frontmatter YAML: ${(error as Error).message}`, 1)
    }
    i = j + 1
  }

  // 2. Block fences (the content tree).
  const root: ContentBlock[] = []
  const stack: Frame[] = []
  const counter = { n: 0 }

  const flushHead = (frame: Frame, line: number): void => {
    if (frame.headBuf.length === 0) return
    const yamlText = dedent(frame.headBuf).join('\n')
    frame.headBuf = []
    if (yamlText.trim() === '') return
    let parsed: unknown
    try {
      parsed = parseYaml(yamlText)
    } catch (error) {
      throw new PageParseError(`Invalid block head YAML: ${(error as Error).message}`, line)
    }
    if (parsed && typeof parsed === 'object') Object.assign(frame.block.data, parsed)
  }

  const finalizeRegion = (frame: Frame): void => {
    const region = frame.region!
    const body = dedent(region.lines)
    while (body.length && body[0]!.trim() === '') body.shift()
    while (body.length && body[body.length - 1]!.trim() === '') body.pop()
    setPath(frame.block.data, region.name, body.join('\n'))
    frame.region = null
  }

  for (; i < lines.length; i++) {
    const line = lines[i]!
    const frame = stack[stack.length - 1]

    // Region capture: a @field is open on the current block.
    if (frame?.region) {
      const region = frame.region
      const fence = matchFence(line)
      if (region.fence !== null) {
        region.lines.push(line)
        if (fence && fence.length >= region.fence.length && line.trimStart().startsWith(region.fence)) {
          region.fence = null
        }
        continue
      }
      if (fence) {
        region.lines.push(line)
        region.fence = fence
        continue
      }
      if (line.startsWith('\\:::') || /^\\@[A-Za-z]/.test(line)) {
        region.lines.push(line.slice(1)) // de-escape a literal line-initial token
        continue
      }
      if (classify(line) === null) {
        region.lines.push(line)
        continue
      }
      finalizeRegion(frame) // a structural token ends the region; fall through to handle it
    }

    const token = classify(line)
    if (token === null) {
      if (!frame) {
        if (line.trim() === '') continue
        throw new PageParseError(`Content outside any block: "${line.trim()}"`, i + 1)
      }
      frame.headBuf.push(line)
      continue
    }

    if (token.kind === 'open') {
      if (frame) flushHead(frame, i + 1)
      const { id, slot } = parseAttrs(token.rest, i + 1)
      const block: ContentBlock = { id: id ?? `auto${++counter.n}`, blockId: token.blockId, data: {} }
      attach(root, frame, block, slot, i + 1)
      stack.push({ block, headBuf: [], region: null })
    } else if (token.kind === 'field') {
      if (!frame) throw new PageParseError(`@${token.name} outside any block`, i + 1)
      flushHead(frame, i + 1)
      frame.region = { name: token.name, lines: [], fence: null }
    } else {
      if (!frame) throw new PageParseError('Close ::: with no open block', i + 1)
      flushHead(frame, i + 1)
      if (token.id && token.id !== frame.block.blockId) {
        throw new PageParseError(
          `Labeled close "::: /${token.id}" does not match open block "::: ${frame.block.blockId}"`,
          i + 1,
        )
      }
      stack.pop()
    }
  }

  if (stack.length) {
    throw new PageParseError(`Unclosed block "::: ${stack[stack.length - 1]!.block.blockId}"`, lines.length)
  }

  return {
    ...(typeof envelope.name === 'string' ? { name: envelope.name } : {}),
    ...(envelope.meta !== undefined ? { meta: envelope.meta as Record<string, unknown> } : {}),
    ...(typeof envelope.order === 'number' ? { order: envelope.order } : {}),
    ...(envelope.orderAfter != null ? { orderAfter: envelope.orderAfter as string } : {}),
    ...(typeof envelope.path === 'string' ? { path: envelope.path } : {}),
    data: (envelope.data as Record<string, unknown>) ?? {},
    content: root,
  }
}

/** Parse the `#id` and `key=value` attributes after a block id on an open fence. */
function parseAttrs(rest: string, line: number): { id?: string; slot?: string } {
  const out: { id?: string; slot?: string } = {}
  for (const part of rest.trim().split(/[ \t]+/).filter(Boolean)) {
    if (part.startsWith('#')) out.id = part.slice(1)
    else if (part.startsWith('slot=')) out.slot = part.slice(5)
    else throw new PageParseError(`Unknown block attribute "${part}"`, line)
  }
  return out
}

/** Place a freshly-opened block into its parent slot (or the page root). */
function attach(
  root: ContentBlock[],
  parent: Frame | undefined,
  block: ContentBlock,
  slot: string | undefined,
  line: number,
): void {
  if (!parent) {
    if (slot) throw new PageParseError('A root-level block cannot have a slot', line)
    root.push(block)
    return
  }
  const owner = parent.block
  if (slot) {
    if (owner.children == null) owner.children = {}
    if (Array.isArray(owner.children)) {
      throw new PageParseError(`Block "::: ${owner.blockId}" mixes default and named slots`, line)
    }
    const map = owner.children as Record<string, ContentBlock[]>
    ;(map[slot] ??= []).push(block)
  } else {
    if (owner.children == null) owner.children = []
    if (!Array.isArray(owner.children)) {
      throw new PageParseError(`Block "::: ${owner.blockId}" mixes default and named slots`, line)
    }
    owner.children.push(block)
  }
}

// ── Serializer ───────────────────────────────────────────────────────────────

/** A top-level string prop becomes an `@field` region past this length, or on any newline. */
const REGION_THRESHOLD = 80
const FLOW_MAX = 72

/** Serialize a {@link PageDoc} into canonical `.page.md` text. */
export function serializePage(doc: PageDoc): string {
  const envelope: Record<string, unknown> = {}
  if (doc.name !== undefined) envelope.name = doc.name
  if (doc.meta !== undefined) envelope.meta = doc.meta
  envelope.data = doc.data ?? {}
  if (doc.order !== undefined) envelope.order = doc.order
  if (doc.orderAfter != null) envelope.orderAfter = doc.orderAfter
  if (doc.path !== undefined) envelope.path = doc.path

  const out: string[] = ['---', emitYaml(envelope), '---', '']
  for (const block of doc.content) emitBlock(block, undefined, out)
  return out.join('\n').replace(/\n+$/, '') + '\n'
}

function emitBlock(block: ContentBlock, slot: string | undefined, out: string[]): void {
  let open = `::: ${block.blockId}`
  if (block.id) open += ` #${block.id}`
  if (slot) open += ` slot=${slot}`
  out.push(open)

  const head: Record<string, unknown> = {}
  const regions: [string, string][] = []
  for (const [key, value] of Object.entries(block.data)) {
    if (typeof value === 'string' && (value.includes('\n') || value.length > REGION_THRESHOLD)) {
      regions.push([key, value])
    } else {
      head[key] = value
    }
  }
  if (Object.keys(head).length) out.push(emitYaml(head))
  for (const [name, value] of regions) {
    out.push(`@${name}`)
    out.push(escapeRegion(value))
  }

  let hasChildren = false
  const children = block.children
  if (Array.isArray(children)) {
    for (const child of children) emitBlock(child, undefined, out)
    hasChildren = children.length > 0
  } else if (children && typeof children === 'object') {
    for (const [slotName, list] of Object.entries(children)) {
      for (const child of list) emitBlock(child, slotName, out)
      if (list.length) hasChildren = true
    }
  }

  out.push(hasChildren ? `::: /${block.blockId}` : ':::')
  out.push('')
}

/** Backslash-escape any line-initial structural token in raw region text (outside code fences). */
function escapeRegion(text: string): string {
  let fence: string | null = null
  return text
    .split('\n')
    .map((line) => {
      const mark = matchFence(line)
      if (fence !== null) {
        if (mark && mark.length >= fence.length && line.trimStart().startsWith(fence)) fence = null
        return line
      }
      if (mark) {
        fence = mark
        return line
      }
      return classify(line) !== null ? '\\' + line : line
    })
    .join('\n')
}

/**
 * Emit a value as YAML. The root mapping always stays block style (one prop per
 * line); only nested collections collapse to flow when short and all-scalar.
 */
function emitYaml(value: unknown): string {
  const doc = new Document(value)
  const root = doc.contents as YamlNode
  if (isSeq(root)) for (const item of root.items) applyFlow(item)
  else if (isMap(root)) for (const pair of root.items) applyFlow(pair.value)
  return doc.toString({ lineWidth: 0 }).replace(/\n$/, '')
}

type YamlNode = any

function applyFlow(node: YamlNode): void {
  if (isSeq(node)) {
    for (const item of node.items) if (isCollection(item)) applyFlow(item)
    node.flow = node.items.length === 0 || (node.items.every(isScalar) && inlineLen(node) <= FLOW_MAX)
  } else if (isMap(node)) {
    for (const pair of node.items) if (isCollection(pair.value)) applyFlow(pair.value)
    node.flow =
      node.items.length === 0 ||
      (node.items.every((pair: YamlNode) => isScalar(pair.value)) && inlineLen(node) <= FLOW_MAX)
  }
}

function inlineLen(node: YamlNode): number {
  if (isScalar(node)) return String(node.value ?? 'null').length + 2
  if (isSeq(node)) return 4 + node.items.reduce((sum: number, item: YamlNode) => sum + inlineLen(item) + 2, 0)
  if (isMap(node)) {
    return (
      4 +
      node.items.reduce(
        (sum: number, pair: YamlNode) => sum + String(pair.key?.value ?? pair.key).length + 2 + inlineLen(pair.value) + 2,
        0,
      )
    )
  }
  return 0
}
