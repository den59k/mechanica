import type { ContentBlock } from 'mechanica-shared'
import { uid } from '../../lib/content-tree'

/** The kind of inspector a selected element shows. */
export type ElementKind = 'frame' | 'text' | 'image'

/** Static per-blockId metadata (kind + whether it holds children). */
interface KindMeta {
  kind: ElementKind
  container: boolean
}

/** The built-in composer element kinds. `mech:button` is gone (R2 → userland). */
const KINDS: Record<string, KindMeta> = {
  'mech:frame': { kind: 'frame', container: true },
  'mech:text': { kind: 'text', container: false },
  'mech:image': { kind: 'image', container: false },
}

/** Kind/container metadata for a block id (null for compiled/composed/component blocks). */
export function elementMeta(blockId: string): KindMeta | null {
  return KINDS[blockId] ?? null
}

/** The inspector kind for a block id, or null. */
export function elementKind(blockId: string): ElementKind | null {
  return KINDS[blockId]?.kind ?? null
}

/** Whether a block id is a container element (holds children). */
export function isContainerBlock(blockId: string): boolean {
  return KINDS[blockId]?.container ?? false
}

/**
 * A palette insert item. Row and Column both create a `mech:frame` — the
 * direction is data, not a second block id — so the `$bp` story (a Row that
 * stacks on mobile) stays one code path. See COMPOSER-REDESIGN §5.
 */
export interface InsertItem {
  key: string
  label: string
  /** VIcon name for the palette card / toolbar button. */
  icon: string
  /** Single-key keyboard shortcut (R/C/T/I). */
  shortcut: string
  container: boolean
  create(): ContentBlock
}

export const INSERT_ITEMS: InsertItem[] = [
  {
    key: 'row',
    label: 'Row',
    icon: 'row',
    shortcut: 'r',
    container: true,
    // Nested frames default to no padding — the root supplies section padding;
    // inner rows/columns should hug their content so nesting doesn't feel spongy.
    create: () => ({ id: uid(), blockId: 'mech:frame', data: { direction: 'row', gap: 16, padding: 0 }, children: [] }),
  },
  {
    key: 'column',
    label: 'Column',
    icon: 'column',
    shortcut: 'c',
    container: true,
    create: () => ({ id: uid(), blockId: 'mech:frame', data: { direction: 'column', gap: 16, padding: 0 }, children: [] }),
  },
  {
    key: 'text',
    label: 'Text',
    icon: 'text',
    shortcut: 't',
    container: false,
    create: () => ({ id: uid(), blockId: 'mech:text', data: { tag: 'p', content: 'Text' } }),
  },
  {
    key: 'image',
    label: 'Image',
    icon: 'image',
    shortcut: 'i',
    container: false,
    create: () => ({ id: uid(), blockId: 'mech:image', data: {} }),
  },
]

const INSERT_BY_SHORTCUT = new Map(INSERT_ITEMS.map((item) => [item.shortcut, item]))

/** The insert item bound to a single-key shortcut (R/C/T/I), or null. */
export function insertItemForKey(key: string): InsertItem | null {
  return INSERT_BY_SHORTCUT.get(key.toLowerCase()) ?? null
}

/** A frame's editor label from its *base* direction: `row` → "Row", else "Column". */
export function frameLabel(node: ContentBlock): string {
  return node.data?.direction === 'row' ? 'Row' : 'Column'
}

const KIND_LABEL: Record<ElementKind, string> = {
  frame: 'Frame',
  text: 'Text',
  image: 'Image',
}
const KIND_ICON: Record<ElementKind, string> = {
  frame: 'frame',
  text: 'text',
  image: 'image',
}

/** A short human label for any node in the layers tree / inspector header. */
export function blockLabel(node: ContentBlock): string {
  const kind = elementKind(node.blockId)
  if (kind === 'frame') return frameLabel(node)
  return kind ? KIND_LABEL[kind] : node.blockId
}

/** The display icon for a node: direction-aware for frames, kind icon otherwise. */
export function blockIcon(node: ContentBlock): string {
  const kind = elementKind(node.blockId)
  if (kind === 'frame') return node.data?.direction === 'row' ? 'row' : 'column'
  return kind ? KIND_ICON[kind] : 'slot'
}
