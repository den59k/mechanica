import type { Component } from 'vue'
import { walkTree, type ContentBlock } from '@mechanica/shared'
import type { BlocksMap } from './state'

/** A dynamic import of one block SFC, from `virtual:mechanica/blocks` (build). */
export type BlockLoader = () => Promise<{ default: Component }>
export type BlockLoaders = Record<string, BlockLoader>

/** Every block id used by a content tree, slots included. */
export function usedBlockIds(content: ContentBlock[]): Set<string> {
  const ids = new Set<string>()
  walkTree(content ?? [], (block) => {
    ids.add(block.blockId)
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
): Promise<BlocksMap> {
  const missing = [...usedBlockIds(content)].filter((id) => !into.has(id) && loaders[id])
  const loaded = await Promise.all(
    missing.map(async (id) => [id, (await loaders[id]!()).default] as const),
  )
  for (const [id, component] of loaded) into.set(id, component)
  return into
}
