import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Recursively list `.vue` files under `dir` in stable (sorted) order. */
function listVueFiles(dir: string): string[] {
  const found: string[] = []
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.vue')) found.push(full)
    }
  }
  walk(dir)
  return found.sort()
}

/**
 * Generate the source of the `virtual:mechanica/blocks` module: it imports every
 * block SFC under `blocksDir` and exposes them as `blocksList` / `blocksMap`.
 *
 * @param resolve Plugin-context resolver, used so each import id is the id Vite
 *                will actually load (preserving the SFC pipeline).
 */
export async function collectBlocks(
  blocksDir: string,
  resolve: (id: string) => Promise<{ id: string } | null>,
): Promise<string> {
  const imports: string[] = []
  const names: string[] = []

  let index = 0
  for (const file of listVueFiles(blocksDir)) {
    const source = readFileSync(file, 'utf-8')
    if (!source.includes('defineBlock')) continue

    const resolved = await resolve(file)
    if (!resolved) continue

    imports.push(`import block${index} from ${JSON.stringify(resolved.id)}`)
    names.push(`block${index}`)
    index++
  }

  return [
    ...imports,
    `export const blocksList = [${names.join(', ')}]`,
    `export const blocksMap = new Map(blocksList.map((block) => [block.blockId, block]))`,
    '',
  ].join('\n')
}
