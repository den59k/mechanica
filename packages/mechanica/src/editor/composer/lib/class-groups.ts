/**
 * Group the site's design-system classes into the composer's **Style** selects.
 * Classes sharing a `group` are mutually exclusive (one single-pick select each);
 * different groups stack on the element. Ungrouped classes share one implicit
 * default group labelled "Style". The element's `cls` is a space-separated string
 * holding at most one class per group. Pure and unit-tested. See COMPOSER-MANIFEST.md.
 */

import type { ComposerClassDef, ComposerElementKind } from 'mechanica-shared'
import { humanize } from '../../props-panel/humanize'

/** The implicit group ungrouped classes fall into (labelled "Style"). */
export const DEFAULT_GROUP = ''

export interface ClassGroup {
  /** Group key (`''` = the default/ungrouped group). */
  key: string
  /** Row label: "Style" for the default group, else the humanized key. */
  label: string
  /** The classes this group offers, for the current kind. */
  defs: ComposerClassDef[]
}

const tokens = (cls: string): string[] => cls.split(/\s+/).filter(Boolean)

/**
 * The kind's classes split into ordered groups — the default group first (so its
 * "Style" row sits on top), then named groups in first-appearance order.
 */
export function classGroupsFor(defs: ComposerClassDef[], kind: ComposerElementKind): ClassGroup[] {
  const order: string[] = []
  const byKey = new Map<string, ComposerClassDef[]>()
  for (const def of defs) {
    if (!def.kinds.includes(kind)) continue
    const key = def.group ?? DEFAULT_GROUP
    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }
    byKey.get(key)!.push(def)
  }
  // Default group first; named groups keep their first-appearance order (stable sort).
  order.sort((a, b) => (a === DEFAULT_GROUP ? -1 : b === DEFAULT_GROUP ? 1 : 0))
  return order.map((key) => ({
    key,
    label: key === DEFAULT_GROUP ? 'Style' : humanize(key),
    defs: byKey.get(key)!,
  }))
}

/**
 * The class currently selected for a group, read from the element's `cls` string.
 * The default group additionally owns any *stale* token (one not claimed by any
 * known class for this kind), so a class removed from the manifest still shows —
 * marked missing — rather than vanishing.
 */
export function selectedClass(cls: string, group: ClassGroup, allForKind: ComposerClassDef[]): string {
  const inGroup = new Set(group.defs.map((d) => d.cls))
  const known = new Set(allForKind.map((d) => d.cls))
  for (const token of tokens(cls)) {
    if (inGroup.has(token)) return token
    if (group.key === DEFAULT_GROUP && !known.has(token)) return token
  }
  return ''
}

/**
 * Set a group's class in `cls` to `next` (`''` clears it), preserving the classes
 * chosen for other groups. The default group also clears any stale token it owns.
 */
export function setGroupClass(
  cls: string,
  group: ClassGroup,
  next: string,
  allForKind: ComposerClassDef[],
): string {
  const inGroup = new Set(group.defs.map((d) => d.cls))
  const known = new Set(allForKind.map((d) => d.cls))
  const kept = tokens(cls).filter((token) => {
    if (inGroup.has(token)) return false // drop this group's previous pick
    if (group.key === DEFAULT_GROUP && !known.has(token)) return false // drop stale (default owns it)
    return true
  })
  if (next) kept.push(next)
  return kept.join(' ')
}
