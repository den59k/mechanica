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
