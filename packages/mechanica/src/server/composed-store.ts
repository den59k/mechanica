import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parseComposedBlock, serializeComposedBlock } from 'mechanica-shared/block-format'
import type { ComposedBlockDefinition } from 'mechanica-shared'
import { writeFileAtomic, markMutated } from './fs-utils'
import { COMPOSED_EXT, loadComposedDefinitions } from '../vite/collect-composed'

/**
 * CRUD for composed blocks under `<mech>/blocks/<id>.block.yml`. Mirrors
 * `pages-store`: atomic writes, own-write marking (so the watcher tells the
 * composer's own saves from external edits), and content-hash versioning for
 * optimistic-concurrency saves (a 409 when the file changed under the editor).
 * See PLAN.md § 5.1.
 */

/** The directory composed blocks live in. */
export function composedDirOf(mechDir: string): string {
  return join(mechDir, 'blocks')
}

const fileOf = (mechDir: string, id: string): string => join(composedDirOf(mechDir), `${id}${COMPOSED_EXT}`)

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

/** List every composed block (summaries), skipping malformed files. */
export function listComposedBlocks(mechDir: string): ComposedBlockListItem[] {
  return loadComposedDefinitions(composedDirOf(mechDir)).map((def) => ({
    id: def.id,
    name: def.name,
    icon: def.icon,
    category: def.category,
  }))
}

/** Read one composed block plus its on-disk version, or `null` when absent. */
export function readComposedBlock(
  mechDir: string,
  id: string,
): { def: ComposedBlockDefinition; version: string } | null {
  const file = fileOf(mechDir, id)
  if (!fs.existsSync(file)) return null
  const text = fs.readFileSync(file, 'utf-8')
  return { def: parseComposedBlock(text, id), version: hash(text) }
}

/** A composed block's current on-disk version (content hash), or `null`. */
export function composedVersion(mechDir: string, id: string): string | null {
  const file = fileOf(mechDir, id)
  if (!fs.existsSync(file)) return null
  return hash(fs.readFileSync(file, 'utf-8'))
}

const writeDef = (mechDir: string, id: string, def: ComposedBlockDefinition): string => {
  const file = fileOf(mechDir, id)
  writeFileAtomic(file, serializeComposedBlock({ ...def, id }))
  return hash(fs.readFileSync(file, 'utf-8'))
}

/** Create a new composed block; throws {@link ComposedBlockExistsError} if taken. */
export function createComposedBlock(mechDir: string, def: ComposedBlockDefinition): { version: string } {
  if (fs.existsSync(fileOf(mechDir, def.id))) throw new ComposedBlockExistsError(def.id)
  return { version: writeDef(mechDir, def.id, def) }
}

/** Overwrite a composed block's definition; returns the new on-disk version. */
export function saveComposedBlock(
  mechDir: string,
  id: string,
  def: ComposedBlockDefinition,
): { version: string } {
  return { version: writeDef(mechDir, id, def) }
}

/** Delete a composed block. Returns whether it existed. */
export function deleteComposedBlock(mechDir: string, id: string): boolean {
  const file = fileOf(mechDir, id)
  if (!fs.existsSync(file)) return false
  fs.rmSync(file)
  markMutated(file)
  return true
}
