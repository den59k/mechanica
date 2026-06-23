import fs from 'node:fs'
import { dirname, join } from 'node:path'
import type { DataScope } from '@mechanica/shared'

/** Site-wide data lives in a single file alongside the pages directory. */
const SITE_DATA_FILE = 'data.json'

/**
 * Split a flat `{ id → value }` data map into page- and site-scoped buckets.
 * Site data is shared across every page, so it is persisted separately; anything
 * else (page scope, or an unknown scope) stays with the page that authored it.
 */
export function splitDataByScope(
  data: Record<string, unknown>,
  scopes: Record<string, DataScope> = {},
): { page: Record<string, unknown>; site: Record<string, unknown> } {
  const page: Record<string, unknown> = {}
  const site: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(data)) {
    if (scopes[id] === 'site') site[id] = value
    else page[id] = value
  }
  return { page, site }
}

/** Read the site-wide data file, returning `{}` when it is missing or invalid. */
export function readSiteData(mechDir: string): Record<string, unknown> {
  const file = join(mechDir, SITE_DATA_FILE)
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

/** Merge the given entries into the site-wide data file (a no-op when empty). */
export function mergeSiteData(mechDir: string, partial: Record<string, unknown>): void {
  if (Object.keys(partial).length === 0) return
  const file = join(mechDir, SITE_DATA_FILE)
  const merged = { ...readSiteData(mechDir), ...partial }
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(merged, null, 2))
}
