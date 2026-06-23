import fs from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { DataScope } from '@mechanica/shared'
import { getPagePath } from './pages-store'

/** Site-wide data lives in a single file alongside the pages directory. */
const SITE_DATA_FILE = 'data.json'
/** Folder-scoped data for every folder lives in one file, keyed by folder path. */
const FOLDERS_DATA_FILE = 'folders.json'

/**
 * Split a flat `{ id → value }` data map into scope buckets. Site and folder
 * data are shared across pages, so they persist separately; anything else (page
 * scope, or an unknown scope) stays with the page that authored it.
 */
export function splitDataByScope(
  data: Record<string, unknown>,
  scopes: Record<string, DataScope> = {},
): { page: Record<string, unknown>; site: Record<string, unknown>; folder: Record<string, unknown> } {
  const page: Record<string, unknown> = {}
  const site: Record<string, unknown> = {}
  const folder: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(data)) {
    if (scopes[id] === 'site') site[id] = value
    else if (scopes[id] === 'folder') folder[id] = value
    else page[id] = value
  }
  return { page, site, folder }
}

/**
 * The folder a page belongs to — the directory holding its page file, relative
 * to `pages/`. Root-level pages return `null` (they have no folder).
 */
export function folderOf(mechDir: string, urlPath: string): string | null {
  const file = getPagePath(mechDir, urlPath)
  const dir = dirname(relative(join(mechDir, 'pages'), file)).replace(/\\/g, '/')
  return dir === '.' || dir === '' ? null : dir
}

function readJsonFile(file: string): Record<string, any> {
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

/** Read the site-wide data file, returning `{}` when it is missing or invalid. */
export function readSiteData(mechDir: string): Record<string, unknown> {
  return readJsonFile(join(mechDir, SITE_DATA_FILE))
}

/** Merge the given entries into the site-wide data file (a no-op when empty). */
export function mergeSiteData(mechDir: string, partial: Record<string, unknown>): void {
  if (Object.keys(partial).length === 0) return
  const file = join(mechDir, SITE_DATA_FILE)
  const merged = { ...readSiteData(mechDir), ...partial }
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(merged, null, 2))
}

/** All folder data, keyed by folder path. */
export function readFoldersData(mechDir: string): Record<string, Record<string, unknown>> {
  return readJsonFile(join(mechDir, FOLDERS_DATA_FILE))
}

/** Read one folder's data (an empty object for the root or an unknown folder). */
export function readFolderData(mechDir: string, folder: string | null): Record<string, unknown> {
  if (!folder) return {}
  return readFoldersData(mechDir)[folder] ?? {}
}

/** Merge entries into a folder's data (a no-op for the root or an empty patch). */
export function mergeFolderData(mechDir: string, folder: string | null, partial: Record<string, unknown>): void {
  if (!folder || Object.keys(partial).length === 0) return
  const file = join(mechDir, FOLDERS_DATA_FILE)
  const all = readFoldersData(mechDir)
  all[folder] = { ...all[folder], ...partial }
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(all, null, 2))
}
