import { pageFolderOf } from './pages-store'
import { contentFilesOf, type Mech } from './content-files'

/** Site-wide data lives in a single file alongside the pages directory. */
const SITE_DATA_FILE = 'data.json'
/** Folder-scoped data for every folder lives in one file, keyed by folder path. */
const FOLDERS_DATA_FILE = 'folders.json'
/**
 * Per-locale overrides of `localized` site/folder data live in sibling files —
 * `data.<locale>.json` / `folders.<locale>.json` — holding only the entries that
 * differ from the default locale (see {@link mergeLocaleSiteData}). Read merges
 * them over the base, so an untranslated entry falls back to the default value.
 */
const localeSiteFile = (locale: string) => `data.${locale}.json`
const localeFoldersFile = (locale: string) => `folders.${locale}.json`

/** Deep JSON equality — good enough for the plain data these files hold. */
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * The folder a page belongs to — the directory holding its page file, relative
 * to `pages/`. Root-level pages return `null` (they have no folder).
 */
export function folderOf(mech: Mech, urlPath: string): string | null {
  return pageFolderOf(mech, urlPath)
}

function readJsonFile(mech: Mech, file: string): Record<string, any> {
  const text = contentFilesOf(mech).read(file)
  if (text == null) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/**
 * Read the site-wide data. With a `locale` (a non-default code) the locale's
 * `localized`-entry overrides merge over the base, so untranslated entries fall
 * back to the default-locale value.
 */
export function readSiteData(mech: Mech, locale?: string): Record<string, unknown> {
  const base = readJsonFile(mech, SITE_DATA_FILE)
  if (!locale) return base
  return { ...base, ...readJsonFile(mech, localeSiteFile(locale)) }
}

/** The site data override for a locale (only the entries that differ from the default). */
export function readSiteLocaleOverride(mech: Mech, locale: string): Record<string, unknown> {
  return readJsonFile(mech, localeSiteFile(locale))
}

/** Merge the given entries into the site-wide data file (a no-op when empty). */
export function mergeSiteData(mech: Mech, partial: Record<string, unknown>): void {
  if (Object.keys(partial).length === 0) return
  const file = SITE_DATA_FILE
  const merged = { ...readJsonFile(mech, file), ...partial }
  contentFilesOf(mech).write(file, JSON.stringify(merged, null, 2))
}

/**
 * Merge `localized` site entries into a locale's override file, keeping only the
 * ones that differ from the default (data.json) value — so an entry set back to
 * the default drops its override and resumes falling back. Removes the file when
 * it ends up empty.
 */
export function mergeLocaleSiteData(mech: Mech, locale: string, partial: Record<string, unknown>): void {
  if (Object.keys(partial).length === 0) return
  const base = readJsonFile(mech, SITE_DATA_FILE)
  const file = localeSiteFile(locale)
  const next = pruneOverride({ ...readJsonFile(mech, file) }, partial, base)
  writeOverride(mech, file, next)
}

/** All folder data, keyed by folder path. */
export function readFoldersData(mech: Mech): Record<string, Record<string, unknown>> {
  return readJsonFile(mech, FOLDERS_DATA_FILE)
}

/** Read one folder's data (an empty object for the root or an unknown folder). With a
 *  `locale`, the locale's override merges over the base folder data. */
export function readFolderData(
  mech: Mech,
  folder: string | null,
  locale?: string,
): Record<string, unknown> {
  if (!folder) return {}
  const base = readFoldersData(mech)[folder] ?? {}
  if (!locale) return base
  const override = readJsonFile(mech, localeFoldersFile(locale))[folder] ?? {}
  return { ...base, ...override }
}

/** Merge entries into a folder's data (a no-op for the root or an empty patch). */
export function mergeFolderData(mech: Mech, folder: string | null, partial: Record<string, unknown>): void {
  if (!folder || Object.keys(partial).length === 0) return
  const file = FOLDERS_DATA_FILE
  const all = readFoldersData(mech)
  all[folder] = { ...all[folder], ...partial }
  contentFilesOf(mech).write(file, JSON.stringify(all, null, 2))
}

/** Diff-and-merge `localized` folder entries into a locale's folder override file. */
export function mergeLocaleFolderData(
  mech: Mech,
  locale: string,
  folder: string | null,
  partial: Record<string, unknown>,
): void {
  if (!folder || Object.keys(partial).length === 0) return
  const base = readFoldersData(mech)[folder] ?? {}
  const file = localeFoldersFile(locale)
  const all = readJsonFile(mech, file)
  const next = pruneOverride({ ...(all[folder] ?? {}) }, partial, base)
  if (Object.keys(next).length === 0) delete all[folder]
  else all[folder] = next
  writeOverride(mech, file, all)
}

/** Apply a patch to an override object, dropping any key equal to the base (default) value. */
function pruneOverride(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  for (const [id, value] of Object.entries(patch)) {
    if (sameJson(value, base[id])) delete current[id]
    else current[id] = value
  }
  return current
}

/** Write an override file, or remove it entirely when it has no overrides left. */
function writeOverride(mech: Mech, file: string, data: Record<string, unknown>): void {
  if (Object.keys(data).length === 0) {
    contentFilesOf(mech).remove(file)
    return
  }
  contentFilesOf(mech).write(file, JSON.stringify(data, null, 2))
}
