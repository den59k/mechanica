import type { Block, ContentBlock } from './types'
import { walkTree } from './schema'

/**
 * Upgrade placed blocks whose data was written with an older schema version.
 *
 * Each placed block records the schema version it was saved with (`v`, absent
 * = 1). When a block type declares a newer `version`, its `migrate` hook runs
 * with the stored data and the version it came from, then the block is
 * stamped with the current version. Runs on load (dev state, export) so pages
 * never render stale-shaped data; the upgrade persists with the next save.
 *
 * Returns whether anything changed.
 */
export function migrateContent(content: ContentBlock[], blocksMap: Map<string, Block>): boolean {
  let changed = false
  walkTree(content, (block) => {
    const meta = blocksMap.get(block.blockId)
    const version = meta?.version
    if (!version) return
    const from = block.v ?? 1
    if (from >= version) return
    if (meta!.migrate) {
      const result = meta!.migrate(block.data ?? {}, from)
      if (result) block.data = result
    }
    block.v = version
    changed = true
  })
  return changed
}

/**
 * Block ids referenced by the content tree that the block registry doesn't
 * know (deleted or renamed block types). These render as nothing — callers
 * should surface them (export warning, editor badge).
 */
export function findUnknownBlocks(content: ContentBlock[], blocksMap: Map<string, Block>): string[] {
  const unknown = new Set<string>()
  walkTree(content, (block) => {
    if (!blocksMap.has(block.blockId)) unknown.add(block.blockId)
  })
  return [...unknown]
}
