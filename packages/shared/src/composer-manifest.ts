import type {
  ComposerClassDef,
  ComposerClassEntry,
  ComposerElementKind,
} from './types'

/**
 * Normalize the Block Composer manifest's `classes` record into the flat list
 * the composer consumes — unfolding the string / array shorthands and defaulting
 * each title to its class name. Pure and DOM-free (the barrel is client-safe);
 * called from the generated `virtual:mechanica/components` module at runtime.
 * See COMPOSER-MANIFEST.md § 2.
 *
 * Shorthands:
 *  - `'text'`               → `{ on: ['text'] }`
 *  - `['frame', 'image']`   → `{ on: ['frame', 'image'] }`
 *  - `{ title?, on, group? }` → as written (only the full form carries a group)
 */
export function normalizeClassManifest(
  classes: Record<string, ComposerClassEntry> | undefined,
): ComposerClassDef[] {
  if (!classes) return []
  const out: ComposerClassDef[] = []
  for (const cls in classes) {
    const entry = classes[cls]
    if (entry == null) continue
    const kinds = classKinds(entry)
    if (!kinds.length) continue
    const full = typeof entry === 'object' && !Array.isArray(entry) ? entry : null
    const def: ComposerClassDef = { cls, title: full?.title || cls, kinds }
    if (full?.group) def.group = full.group
    out.push(def)
  }
  return out
}

const KINDS: readonly ComposerElementKind[] = ['frame', 'text', 'image']
const isKind = (v: unknown): v is ComposerElementKind => KINDS.includes(v as ComposerElementKind)

/** The element kinds a `classes` entry applies to (any shorthand), deduped. */
function classKinds(entry: ComposerClassEntry): ComposerElementKind[] {
  const raw = isKind(entry) ? [entry] : Array.isArray(entry) ? entry : entry.on
  const list = Array.isArray(raw) ? raw : [raw]
  return [...new Set(list.filter(isKind))]
}
