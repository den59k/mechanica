import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileBlock } from '../compiler/compile-block'

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

export interface LazyBlocksResult {
  /** The generated module source (exports `blockLoaders`). */
  code: string
  /** Source file per block id, for the build's block manifest. */
  files: Map<string, string>
}

/**
 * The build-time variant of {@link collectBlocks}: instead of importing every
 * block statically (which bundles all blocks into the client entry), emit a
 * `blockLoaders` map of dynamic imports keyed by block id. The bundler then
 * splits one chunk per block, and a page only loads the blocks it uses.
 *
 * The block id is known without loading the module because the compiler
 * derives it from the source (`compileBlock`), so the keys are static.
 */
export async function collectBlocksLazy(
  blocksDir: string,
  resolve: (id: string) => Promise<{ id: string } | null>,
): Promise<LazyBlocksResult> {
  const loaders: string[] = []
  const files = new Map<string, string>()

  for (const file of listVueFiles(blocksDir)) {
    const source = readFileSync(file, 'utf-8')
    if (!source.includes('defineBlock')) continue

    const compiled = compileBlock(source, file)
    if (!compiled) continue

    const resolved = await resolve(file)
    if (!resolved) continue

    loaders.push(`  ${JSON.stringify(compiled.blockId)}: () => import(${JSON.stringify(resolved.id)}),`)
    files.set(compiled.blockId, file)
  }

  const code = ['export const blockLoaders = {', ...loaders, '}', ''].join('\n')
  return { code, files }
}
