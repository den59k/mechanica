import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parseComposedBlock, serializeComposedBlock } from 'mechanica-shared/block-format'
import type { ComposedBlockDefinition } from 'mechanica-shared'
import { contentFilesOf, type Mech } from './content-files'
import { COMPOSED_EXT } from '../vite/collect-composed'

/**
 * CRUD for composed blocks under `<mech>/blocks/<id>.block.yml`. Mirrors
 * `pages-store`: atomic writes, own-write marking (so the watcher tells the
 * composer's own saves from external edits), and content-hash versioning for
 * optimistic-concurrency saves (a 409 when the file changed under the editor).
 * See PLAN.md § 5.1.
 */

/** The directory composed blocks live in, relative to the `.mech` root. */
const BLOCKS = 'blocks'

/** The directory composed blocks live in on disk. */
export function composedDirOf(mechDir: string): string {
  return join(mechDir, BLOCKS)
}

const fileOf = (id: string): string => `${BLOCKS}/${id}${COMPOSED_EXT}`

const hash = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 16)

/** Thrown by {@link createComposedBlock} when the id is already taken. */
export class ComposedBlockExistsError extends Error {
  constructor(public readonly id: string) {
    super(`Composed block already exists: ${id}`)
    this.name = 'ComposedBlockExistsError'
    Object.setPrototypeOf(this, ComposedBlockExistsError.prototype)
  }
}

/** A composed block as listed for the palette. */
export interface ComposedBlockListItem {
  id: string
  name: string
  icon?: string
  category?: string
}

/** Every composed-block definition of the site, in id order; a malformed file is skipped. */
export function readComposedBlocks(mech: Mech): ComposedBlockDefinition[] {
  const files = contentFilesOf(mech)
  const defs: ComposedBlockDefinition[] = []
  for (const file of files.list(BLOCKS).sort()) {
    const name = file.slice(BLOCKS.length + 1)
    if (name.includes('/') || !name.endsWith(COMPOSED_EXT)) continue
    try {
      defs.push(parseComposedBlock(files.read(file) ?? '', name.slice(0, -COMPOSED_EXT.length)))
    } catch {
      /* one bad block never breaks the whole set */
    }
  }
  return defs
}

/** List every composed block (summaries), skipping malformed files. */
export function listComposedBlocks(mech: Mech): ComposedBlockListItem[] {
  return readComposedBlocks(mech).map((def) => ({
    id: def.id,
    name: def.name,
    icon: def.icon,
    category: def.category,
  }))
}

/** Read one composed block plus its version, or `null` when absent. */
export function readComposedBlock(
  mech: Mech,
  id: string,
): { def: ComposedBlockDefinition; version: string } | null {
  const text = contentFilesOf(mech).read(fileOf(id))
  if (text == null) return null
  return { def: parseComposedBlock(text, id), version: hash(text) }
}

/** A composed block's current version (content hash), or `null`. */
export function composedVersion(mech: Mech, id: string): string | null {
  const text = contentFilesOf(mech).read(fileOf(id))
  return text == null ? null : hash(text)
}

const writeDef = (mech: Mech, id: string, def: ComposedBlockDefinition): string => {
  const text = serializeComposedBlock({ ...def, id })
  contentFilesOf(mech).write(fileOf(id), text)
  return hash(text)
}

/** Create a new composed block; throws {@link ComposedBlockExistsError} if taken. */
export function createComposedBlock(mech: Mech, def: ComposedBlockDefinition): { version: string } {
  if (contentFilesOf(mech).has(fileOf(def.id))) throw new ComposedBlockExistsError(def.id)
  return { version: writeDef(mech, def.id, def) }
}

/** Overwrite a composed block's definition; returns the new version. */
export function saveComposedBlock(mech: Mech, id: string, def: ComposedBlockDefinition): { version: string } {
  return { version: writeDef(mech, id, def) }
}

/** Delete a composed block. Returns whether it existed. */
export function deleteComposedBlock(mech: Mech, id: string): boolean {
  return contentFilesOf(mech).remove(fileOf(id))
}
