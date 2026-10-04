import fs from 'node:fs'
import { dirname } from 'node:path'

/**
 * Filesystem helpers for the `.mech` store: atomic writes (temp file + rename,
 * so a crash mid-save never leaves a half-written page) and a registry of our
 * own recent mutations, so the dev server's watcher can tell external edits
 * (Claude, another tool) from the editor's own saves.
 */

/** Normalize for registry matching only (watcher paths vs `join()` paths). */
const registryKey = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

const recentMutations = new Map<string, number>()

/** Record that this process just mutated `file` (write, delete, rename). */
export function markMutated(file: string): void {
  recentMutations.set(registryKey(file), Date.now())
}

/** Whether this process mutated `file` within the last `windowMs`. */
export function wasRecentlyMutated(file: string, windowMs = 2000): boolean {
  const at = recentMutations.get(registryKey(file))
  return at != null && Date.now() - at < windowMs
}

let tmpCounter = 0

/** Write `content` atomically (temp file in the same dir, then rename over). */
export function writeFileAtomic(file: string, content: string): void {
  fs.mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${tmpCounter++}.tmp`
  fs.writeFileSync(tmp, content)
  try {
    fs.renameSync(tmp, file)
  } catch (error) {
    fs.rmSync(tmp, { force: true })
    throw error
  }
  markMutated(file)
}
