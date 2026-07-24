import { unfoldSchema } from 'compact-json-schema'
import type { DataEntry } from 'mechanica-shared'

export interface DataEntryInput {
  id: string
  title?: string
  props: unknown
  /** Restrict the entry to pages under this folder (nested folders match by prefix). */
  folder?: string
  /** Translate this entry's site/folder value per locale (multi-language sites). */
  localized?: boolean
}

const entries: DataEntryInput[] = []

/**
 * Record a `defineData` declaration for editor/SSR introspection. Replaces v1's
 * `globalThis._dataEntries` hack with an explicit module registry.
 */
export function registerDataEntry(entry: DataEntryInput): void {
  const existing = entries.find((e) => e.id === entry.id)
  if (existing) Object.assign(existing, entry)
  else entries.push(entry)
}

/** All registered data entries, with their schemas unfolded. */
export function getDataEntries(): DataEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    props: unfoldSchema(entry.props as never),
    ...(entry.folder ? { folder: entry.folder } : {}),
    ...(entry.localized ? { localized: true } : {}),
  }))
}

/** Clear the registry (used between SSR renders / in tests). */
export function clearDataEntries(): void {
  entries.length = 0
}
