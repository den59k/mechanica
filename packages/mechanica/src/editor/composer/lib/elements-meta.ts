import type { ContentBlock } from 'mechanica-shared'
import { uid } from '../../lib/content-tree'

/** The kind of inspector a selected element shows. */
export type ElementKind = 'frame' | 'text' | 'image' | 'button'

/** Editor-facing metadata for a composer element (the insert palette + inspector). */
export interface ElementMeta {
  blockId: string
  kind: ElementKind
  label: string
  /** VIcon name for the palette card. */
  icon: string
  /** Whether it holds child elements (only the frame, in v1). */
  container: boolean
  /** A fresh node with sensible default data. */
  create(): ContentBlock
}

/** The built-in composer elements, in palette order. */
export const ELEMENTS: ElementMeta[] = [
  {
    blockId: 'mech:frame',
    kind: 'frame',
    label: 'Frame',
    icon: 'frame',
    container: true,
    create: () => ({
      id: uid(),
      blockId: 'mech:frame',
      data: { direction: 'column', gap: 16, padding: 24 },
      children: [],
    }),
  },
  {
    blockId: 'mech:text',
    kind: 'text',
    label: 'Text',
    icon: 'text',
    container: false,
    create: () => ({ id: uid(), blockId: 'mech:text', data: { tag: 'p', content: 'Text' } }),
  },
  {
    blockId: 'mech:image',
    kind: 'image',
    label: 'Image',
    icon: 'image',
    container: false,
    create: () => ({ id: uid(), blockId: 'mech:image', data: {} }),
  },
  {
    blockId: 'mech:button',
    kind: 'button',
    label: 'Button',
    icon: 'button',
    container: false,
    create: () => ({ id: uid(), blockId: 'mech:button', data: { label: 'Button', variant: 'primary' } }),
  },
]

const BY_ID = new Map(ELEMENTS.map((meta) => [meta.blockId, meta]))

/** Element metadata for a block id (null for compiled/composed blocks). */
export function elementMeta(blockId: string): ElementMeta | null {
  return BY_ID.get(blockId) ?? null
}

/** Whether a block id is a container element (holds children). */
export function isContainerBlock(blockId: string): boolean {
  return BY_ID.get(blockId)?.container ?? false
}

/** A short human label for any block in the layers tree (element or block id). */
export function blockLabel(node: ContentBlock): string {
  return BY_ID.get(node.blockId)?.label ?? node.blockId
}
