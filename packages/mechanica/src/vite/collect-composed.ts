import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseComposedBlock } from 'mechanica-shared/block-format'
import type { ComposedBlockDefinition } from 'mechanica-shared'

/** Filename suffix for composed-block documents under `<mech>/blocks`. */
export const COMPOSED_EXT = '.block.yml'

/** List `*.block.yml` files directly under `dir`, in stable (sorted) order. */
function listComposedFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(COMPOSED_EXT))
      .sort()
      .map((name) => join(dir, name))
  } catch {
    return []
  }
}

/**
 * Read and parse every composed-block definition under `dir`
 * (`<mech>/blocks`). A malformed file is skipped (reported via `onError`) so one
 * bad block never breaks the whole set. The id defaults to the filename base.
 */
export function loadComposedDefinitions(
  dir: string,
  onError?: (file: string, error: unknown) => void,
): ComposedBlockDefinition[] {
  const defs: ComposedBlockDefinition[] = []
  for (const file of listComposedFiles(dir)) {
    try {
      defs.push(parseComposedBlock(readFileSync(file, 'utf-8'), basename(file, COMPOSED_EXT)))
    } catch (error) {
      onError?.(file, error)
    }
  }
  return defs
}

/**
 * Generate the `virtual:mechanica/composed` module source: the parsed
 * definitions baked in as a JSON literal (they are data, never imports). Loaded
 * by the client/SSR/preview entries, which register them into the block set.
 */
export function collectComposed(dir: string, onError?: (file: string, error: unknown) => void): string {
  const defs = loadComposedDefinitions(dir, onError)
  return `export const composedList = ${JSON.stringify(defs)}\n`
}
