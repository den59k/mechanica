import { reactive } from 'vue'

/**
 * Collapsed node ids in the Layers tree. A module-level reactive set so the
 * recursive HierarchyTree shares one collapse state; stale ids (from removed or
 * other-page blocks) linger harmlessly.
 */
const collapsed = reactive(new Set<string>())

export function isCollapsed(id: string): boolean {
  return collapsed.has(id)
}

export function toggleCollapsed(id: string): void {
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
}
