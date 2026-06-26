import { reactive, ref } from 'vue'

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

export function expand(id: string): void {
  collapsed.delete(id)
}

export function collapse(id: string): void {
  collapsed.add(id)
}

/**
 * The tree's roving keyboard focus — the row that holds `tabindex="0"`. Shared
 * across the recursive HierarchyTree so the whole tree is a single tab stop;
 * arrow keys move it. Null when focus is outside the tree (falls back to the
 * selected/first row as the tab entry point).
 */
export const focusedRowId = ref<string | null>(null)
