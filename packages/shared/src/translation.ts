/**
 * Translation overlays — pure, DOM-free helpers that let a page's `@locale`
 * file store *only* what it changes and inherit everything else from the
 * default-locale page. The mechanism mirrors the localized shared-data pattern
 * (diff-against-base), one level deeper: inside a page's block tree.
 *
 * Two directions:
 *  - {@link mergeTranslation} — read time (dev `buildPageState` + static export):
 *    overlay the sparse translation on the base so shared fields (images, links,
 *    colors, layout) resolve to the default-locale value automatically.
 *  - {@link diffTranslation} — save time: strip everything a translation shares
 *    with the base, so the file on disk carries only the genuinely translated
 *    fields (and stays a readable, reviewable diff).
 *
 * Two structural rules, both following the "**base owns structure**" model:
 *  - **Blocks** are matched by their stable `id`. The base owns which blocks
 *    exist and their order; a translation only fills fields on the blocks it
 *    shares. A block added to the base appears in every locale (untranslated).
 *  - Within a block's `data`, **objects deep-merge** (so an image's `alt` can be
 *    translated while its `src` inherits), while **arrays and scalars replace
 *    wholesale** — an array (rich text, a list of cards) is an atomic unit: a
 *    translation either inherits it or overrides it entirely, never a mix (which
 *    would interleave translated and untranslated entries).
 */

import type { ContentBlock } from './types'

type Data = Record<string, unknown>
type Children = ContentBlock['children']

function isPlainObject(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural deep-equality (objects key-insensitive to order, arrays ordered). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => deepEqual(value, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => key in b && deepEqual(a[key], b[key]))
  }
  return false
}

/**
 * Overlay a translation `overlay` value on its `base`: objects deep-merge
 * (per-key inheritance), arrays and scalars are taken from the overlay when it
 * provides one, and an absent overlay (`undefined`) inherits the base.
 */
export function mergeValue(base: unknown, overlay: unknown): unknown {
  if (overlay === undefined) return base
  if (isPlainObject(base) && isPlainObject(overlay)) {
    const out: Data = { ...base }
    for (const key of Object.keys(overlay)) out[key] = mergeValue(base[key], overlay[key])
    return out
  }
  return overlay
}

/**
 * The sparse diff of a `full` value against its `base`: equal values collapse to
 * `undefined` (inherit), objects keep only their differing keys (recursively),
 * and arrays/scalars are kept whole when changed.
 */
export function diffValue(base: unknown, full: unknown): unknown {
  if (deepEqual(base, full)) return undefined
  if (isPlainObject(base) && isPlainObject(full)) {
    const out: Data = {}
    for (const key of Object.keys(full)) {
      const diff = diffValue(base[key], full[key])
      if (diff !== undefined) out[key] = diff
    }
    return Object.keys(out).length ? out : undefined
  }
  return full
}

/** Overlay translated blocks on the base list, matched by `id` (base owns order). */
export function mergeBlocks(base: ContentBlock[], overlay: ContentBlock[] | undefined): ContentBlock[] {
  if (!overlay?.length) return base
  const byId = new Map(overlay.map((block) => [block.id, block]))
  return base.map((block) => mergeBlock(block, byId.get(block.id)))
}

function mergeBlock(base: ContentBlock, overlay: ContentBlock | undefined): ContentBlock {
  if (!overlay) return base
  const merged: ContentBlock = {
    ...base,
    data: mergeValue(base.data ?? {}, overlay.data ?? {}) as Data,
  }
  const children = mergeChildren(base.children, overlay.children)
  if (children !== undefined) merged.children = children
  return merged
}

function mergeChildren(base: Children, overlay: Children): Children {
  if (base === undefined) return undefined
  if (Array.isArray(base)) {
    return mergeBlocks(base, Array.isArray(overlay) ? overlay : undefined)
  }
  const overlaySlots = overlay && !Array.isArray(overlay) ? overlay : undefined
  const out: Record<string, ContentBlock[]> = {}
  for (const slot of Object.keys(base)) out[slot] = mergeBlocks(base[slot] ?? [], overlaySlots?.[slot])
  return out
}

/** Keep only the blocks (and fields) a `full` list changes vs `base` (base owns structure). */
export function diffBlocks(base: ContentBlock[], full: ContentBlock[]): ContentBlock[] {
  const byId = new Map(base.map((block) => [block.id, block]))
  const out: ContentBlock[] = []
  for (const block of full) {
    const baseBlock = byId.get(block.id)
    // Base owns structure: an overlay-only block never renders, so drop it.
    if (!baseBlock) continue
    const data = diffValue(baseBlock.data ?? {}, block.data ?? {}) as Data | undefined
    const children = diffChildren(baseBlock.children, block.children)
    if (data === undefined && children === undefined) continue
    const sparse: ContentBlock = { id: block.id, blockId: block.blockId, data: data ?? {} }
    if (block.v !== undefined) sparse.v = block.v
    if (children !== undefined) sparse.children = children
    out.push(sparse)
  }
  return out
}

function diffChildren(base: Children, full: Children): Children | undefined {
  if (full === undefined) return undefined
  if (!Array.isArray(full)) {
    // Named slots.
    const baseSlots = base && !Array.isArray(base) ? base : undefined
    const out: Record<string, ContentBlock[]> = {}
    for (const slot of Object.keys(full)) {
      const diff = diffBlocks(baseSlots?.[slot] ?? [], full[slot] ?? [])
      if (diff.length) out[slot] = diff
    }
    return Object.keys(out).length ? out : undefined
  }
  const diff = diffBlocks(Array.isArray(base) ? base : [], full)
  return diff.length ? diff : undefined
}

/** The overlay-able projection of a page: its content tree, page data and frontmatter meta. */
export interface TranslationDoc {
  content?: ContentBlock[]
  data?: Data
  meta?: Data
}

/** Read-time: resolve a sparse translation against the default-locale page. */
export function mergeTranslation(base: TranslationDoc, overlay: TranslationDoc): Required<TranslationDoc> {
  return {
    content: mergeBlocks(base.content ?? [], overlay.content),
    data: mergeValue(base.data ?? {}, overlay.data ?? {}) as Data,
    meta: mergeValue(base.meta ?? {}, overlay.meta ?? {}) as Data,
  }
}

/** Save-time: reduce a full translation to only what differs from the base. */
export function diffTranslation(base: TranslationDoc, full: TranslationDoc): Required<TranslationDoc> {
  return {
    content: diffBlocks(base.content ?? [], full.content ?? []),
    data: (diffValue(base.data ?? {}, full.data ?? {}) as Data) ?? {},
    meta: (diffValue(base.meta ?? {}, full.meta ?? {}) as Data) ?? {},
  }
}
