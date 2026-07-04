import type { ComposedBlockDefinition, ContentBlock } from 'mechanica-shared'

/**
 * The root-frame invariant: in the composer, a composed block *is* a frame.
 * `def.template` is always exactly one `mech:frame` node — the root — so "the
 * block's layout" is a real, selectable entity (its direction, padding,
 * background, content width) rather than an implicit bare node list.
 *
 * Only the editor enforces this; the runtime (`resolveComposedTemplate`) still
 * tolerates any template, so hand-authored files that omit a root frame render
 * fine — they're just wrapped when opened in the composer.
 */

/** Whether a template already satisfies the invariant (single frame root). */
export function isRootTemplate(template: ContentBlock[]): boolean {
  return template.length === 1 && template[0]!.blockId === 'mech:frame'
}

/** A fresh root column frame — the starting shape for a new composed block. */
export function createRootFrame(children: ContentBlock[] = []): ContentBlock {
  return {
    id: 'root',
    blockId: 'mech:frame',
    data: { direction: 'column', gap: 24, padding: [64, 24] },
    children,
  }
}

/**
 * Normalize a template to the root-frame invariant. A template that is already
 * a single frame passes through (its `children` list is ensured); anything else
 * — legacy multi-root, a non-frame root, or empty — is wrapped in a fresh root
 * column frame that adopts the existing nodes as its children.
 */
export function normalizeTemplate(template: ContentBlock[]): ContentBlock[] {
  if (isRootTemplate(template)) {
    const root = template[0]!
    return [{ ...root, children: root.children ?? [] }]
  }
  return [createRootFrame(template.slice())]
}

/** Normalize a whole definition in place-safe fashion (returns a new object). */
export function normalizeDefinition(def: ComposedBlockDefinition): ComposedBlockDefinition {
  return { ...def, template: normalizeTemplate(def.template ?? []) }
}
