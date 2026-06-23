import type { ContentBlock } from '@mechanica/shared'

/** Generate a unique content-block instance id. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36)
}

/** All child lists of a block (default-slot array or named-slot lists). */
function childLists(block: ContentBlock): ContentBlock[][] {
  if (!block.children) return []
  return Array.isArray(block.children) ? [block.children] : Object.values(block.children)
}

/** Depth-first search for a block by instance id. */
export function findBlock(tree: ContentBlock[], id: string): ContentBlock | null {
  for (const block of tree) {
    if (block.id === id) return block
    for (const list of childLists(block)) {
      const found = findBlock(list, id)
      if (found) return found
    }
  }
  return null
}

/** Remove a block by id from anywhere in the tree. Returns whether it was found. */
export function removeBlock(tree: ContentBlock[], id: string): boolean {
  const index = tree.findIndex((block) => block.id === id)
  if (index >= 0) {
    tree.splice(index, 1)
    return true
  }
  for (const block of tree) {
    for (const list of childLists(block)) {
      if (removeBlock(list, id)) return true
    }
  }
  return false
}

/** Find the sibling list that directly contains `id`, plus its index. */
export function findParentList(
  tree: ContentBlock[],
  id: string,
): { list: ContentBlock[]; index: number } | null {
  const index = tree.findIndex((block) => block.id === id)
  if (index >= 0) return { list: tree, index }
  for (const block of tree) {
    for (const list of childLists(block)) {
      const found = findParentList(list, id)
      if (found) return found
    }
  }
  return null
}

/** Move a block within its sibling list by `delta` (no-op if out of range). */
export function moveBlock(tree: ContentBlock[], id: string, delta: number): boolean {
  const found = findParentList(tree, id)
  if (!found) return false
  const target = found.index + delta
  if (target < 0 || target >= found.list.length) return false
  const [block] = found.list.splice(found.index, 1)
  found.list.splice(target, 0, block!)
  return true
}

/** Deep-clone a block, assigning fresh ids throughout. */
export function cloneBlock(block: ContentBlock): ContentBlock {
  const clone: ContentBlock = {
    id: uid(),
    blockId: block.blockId,
    data: JSON.parse(JSON.stringify(block.data)),
  }
  if (Array.isArray(block.children)) {
    clone.children = block.children.map(cloneBlock)
  } else if (block.children) {
    clone.children = Object.fromEntries(
      Object.entries(block.children).map(([slot, list]) => [slot, list.map(cloneBlock)]),
    )
  }
  return clone
}

/** Insert a clone of `id` right after it. Returns the new block. */
export function duplicateBlock(tree: ContentBlock[], id: string): ContentBlock | null {
  const found = findParentList(tree, id)
  if (!found) return null
  const clone = cloneBlock(found.list[found.index]!)
  found.list.splice(found.index + 1, 0, clone)
  return clone
}

/**
 * A drop location: before/after a sibling, *inside* a container's slot, or
 * (with `anchorId: null`) appended to the root.
 */
export interface DropPosition {
  anchorId: string | null
  position: 'before' | 'after' | 'inside'
  /** For `'inside'`: which named slot to append to (defaults to the default slot). */
  slot?: string
}

/** Get (creating if needed) the child list for a block's slot. */
export function ensureSlotList(parent: ContentBlock, slot = 'default'): ContentBlock[] {
  // No children yet: a default slot is a bare array; a named slot is an object.
  if (!parent.children) {
    if (slot === 'default') return (parent.children = [])
    const named: Record<string, ContentBlock[]> = { [slot]: [] }
    parent.children = named
    return named[slot]!
  }
  // An array represents the default slot.
  if (Array.isArray(parent.children)) {
    if (slot === 'default') return parent.children
    // Need a named slot too → promote the array to the `default` key.
    const named: Record<string, ContentBlock[]> = { default: parent.children, [slot]: [] }
    parent.children = named
    return named[slot]!
  }
  // Named-slot object.
  const named = parent.children
  return (named[slot] ??= [])
}

/** Insert `block` at a drop position. */
export function placeBlock(tree: ContentBlock[], block: ContentBlock, drop: DropPosition): void {
  if (drop.position === 'inside' && drop.anchorId) {
    const parent = findBlock(tree, drop.anchorId)
    if (parent) {
      ensureSlotList(parent, drop.slot).push(block)
      return
    }
  }
  if (drop.anchorId === null) {
    tree.push(block)
    return
  }
  const found = findParentList(tree, drop.anchorId)
  if (!found) {
    tree.push(block)
    return
  }
  const index = drop.position === 'before' ? found.index : found.index + 1
  found.list.splice(index, 0, block)
}

/** Move an existing block to a drop position, refusing drops into its own subtree. */
export function relocateBlock(tree: ContentBlock[], id: string, drop: DropPosition): boolean {
  if (id === drop.anchorId) return false
  const block = findBlock(tree, id)
  if (!block) return false
  // Can't drop a block inside itself.
  if (drop.anchorId && findBlock([block], drop.anchorId)) return false
  removeBlock(tree, id)
  placeBlock(tree, block, drop)
  return true
}
