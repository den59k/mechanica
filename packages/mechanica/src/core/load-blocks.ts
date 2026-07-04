import type { Component } from 'vue'
import { walkTree, templateBlockIds, type ComposedBlockDefinition, type ContentBlock } from 'mechanica-shared'
import type { BlocksMap } from './state'

/** A dynamic import of one block SFC, from `virtual:mechanica/blocks` (build). */
export type BlockLoader = () => Promise<{ default: Component }>
export type BlockLoaders = Record<string, BlockLoader>

/**
 * Every block id used by a content tree, slots included. When `composed` is
 * given, a placed composed block also contributes the block ids inside its
 * template (recursively), so the compiled blocks it renders through get their
 * chunks loaded before it mounts. Element blocks (`mech:*`) and composed ids
 * themselves have no loader and are simply skipped by {@link loadBlocks}.
 */
export function usedBlockIds(
  content: ContentBlock[],
  composed?: Map<string, ComposedBlockDefinition>,
): Set<string> {
  const ids = new Set<string>()
  const expand = (id: string): void => {
    const def = composed?.get(id)
    if (!def) return
    for (const inner of templateBlockIds(def)) {
      if (ids.has(inner)) continue
      ids.add(inner)
      expand(inner)
    }
  }
  walkTree(content ?? [], (block) => {
    if (ids.has(block.blockId)) return
    ids.add(block.blockId)
    expand(block.blockId)
  })
  return ids
}

/**
 * Load the block components a content tree actually uses, in parallel, into
 * `into` (a new map by default). Ids already present are not re-fetched; ids
 * with no loader are skipped (`renderBlocks` tolerates unknown blocks).
 *
 * The generated client entry awaits this before mounting so hydration sees
 * real components (no async-component fallbacks, no mismatch); the router
 * awaits it before swapping content on SPA navigation.
 */
export async function loadBlocks(
  loaders: BlockLoaders,
  content: ContentBlock[],
  into: BlocksMap = new Map(),
  composed?: Map<string, ComposedBlockDefinition>,
): Promise<BlocksMap> {
  const missing = [...usedBlockIds(content, composed)].filter((id) => !into.has(id) && loaders[id])
  const loaded = await Promise.all(
    missing.map(async (id) => [id, (await loaders[id]!()).default] as const),
  )
  for (const [id, component] of loaded) into.set(id, component)
  return into
}
