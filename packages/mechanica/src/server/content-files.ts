import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { markMutated, writeFileAtomic } from './fs-utils'

/**
 * The text files of a site's content — what lives under `.mech/` apart from
 * uploads: pages, shared data, composed blocks. The stores read and write a
 * site only through this, so the same code runs over a directory (the dev
 * server) and over a set of files a host assembled in memory (a hosted editor
 * whose published content is in git and whose draft is in a database).
 *
 * Paths are relative to the `.mech` root and use forward slashes
 * (`pages/blog/post.page.md`, `data.json`). Everything is synchronous: the
 * whole text of a site is small enough to be handed over at once.
 */
export interface ContentFiles {
  /** Whether a file exists at `path`. */
  has(path: string): boolean
  /** The file's text, or null when there is none. */
  read(path: string): string | null
  /** Create or replace a file. */
  write(path: string, content: string): void
  /** Delete a file. Returns whether it existed. */
  remove(path: string): boolean
  /** Move a file, replacing whatever is at `to`. The file must exist. */
  rename(from: string, to: string): void
  /** Every file under the directory `dir`, at any depth, as root-relative paths. */
  list(dir: string): string[]
  /** The names of the directories directly inside `dir`. */
  dirs(dir: string): string[]
  /** Whether `path` is a directory. */
  isDir(path: string): boolean
}

/** Where a site's content is: a `.mech` directory on disk, or a set of files. */
export type Mech = string | ContentFiles

const slash = (path: string) => path.replace(/\\/g, '/')

/**
 * The files of a `.mech` directory on disk. Writes are atomic and registered as
 * this process's own (see `fs-utils`), so a watcher can tell them from external
 * edits; removing the last file of a nested folder removes the folder.
 */
function createFsFiles(root: string): ContentFiles {
  const at = (path: string) => join(root, path)
  const pruneParent = (path: string) => {
    // Only folders below a top-level directory: `pages/blog`, never `pages` or the root.
    const dir = dirname(path)
    if (dir.split('/').length < 2) return
    const full = at(dir)
    if (fs.existsSync(full) && fs.readdirSync(full).length === 0) fs.rmSync(full, { recursive: true })
  }
  return {
    has: (path) => fs.statSync(at(path), { throwIfNoEntry: false })?.isFile() === true,
    read(path) {
      try {
        return fs.readFileSync(at(path), 'utf-8')
      } catch {
        return null
      }
    },
    write: (path, content) => writeFileAtomic(at(path), content),
    remove(path) {
      const file = at(path)
      if (!fs.existsSync(file)) return false
      fs.rmSync(file)
      markMutated(file)
      pruneParent(path)
      return true
    },
    rename(from, to) {
      if (from === to) return
      fs.mkdirSync(dirname(at(to)), { recursive: true })
      fs.renameSync(at(from), at(to))
      markMutated(at(from))
      markMutated(at(to))
      pruneParent(from)
    },
    list(dir) {
      const full = at(dir)
      if (!fs.existsSync(full)) return []
      return (fs.readdirSync(full, { recursive: true, withFileTypes: true }) as fs.Dirent[])
        .filter((entry) => entry.isFile())
        .map((entry) => slash(join(entry.parentPath, entry.name)).slice(slash(root).length + 1))
    },
    dirs(dir) {
      const full = at(dir)
      if (!fs.existsSync(full)) return []
      return fs
        .readdirSync(full, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    },
    isDir: (path) => fs.statSync(at(path), { throwIfNoEntry: false })?.isDirectory() === true,
  }
}

// One object per directory: what the stores know about a site (its codec, its
// block schemas) hangs off the files object, so it must be the same every time.
const fsFiles = new Map<string, ContentFiles>()

/** The content files of a `.mech` directory on disk. */
export function fsContentFiles(mechDir: string): ContentFiles {
  const root = resolve(mechDir)
  let files = fsFiles.get(root)
  if (!files) fsFiles.set(root, (files = createFsFiles(root)))
  return files
}

/** The files a {@link Mech} stands for. */
export const contentFilesOf = (mech: Mech): ContentFiles => (typeof mech === 'string' ? fsContentFiles(mech) : mech)

/** What changed in a {@link MemoryContentFiles} since it was created. */
export interface ContentChanges {
  /** Files that are new or whose text differs: path → text. */
  written: Map<string, string>
  /** Files that existed at the start and are gone. */
  removed: string[]
  /** Files that got their place through a rename: new path → the path they started at. */
  moved: Map<string, string>
}

export interface MemoryContentFiles extends ContentFiles {
  /** The difference between the files now and the files this was created with. */
  changes(): ContentChanges
}

/**
 * Content files held in memory, remembering how they differ from what they
 * started as — a host hands the stores a site's files this way and persists
 * `changes()` afterwards. A directory exists exactly while it holds a file.
 */
export function memoryContentFiles(initial: Iterable<readonly [string, string]> | Record<string, string>): MemoryContentFiles {
  const entries = Symbol.iterator in initial ? initial : Object.entries(initial)
  const original = new Map<string, string>(entries as Iterable<readonly [string, string]>)
  const files = new Map(original)
  // new path → the original path its content was moved from
  const origins = new Map<string, string>()

  const under = (dir: string) => (dir === '' ? '' : dir.replace(/\/+$/, '') + '/')

  return {
    has: (path) => files.has(path),
    read: (path) => files.get(path) ?? null,
    write(path, content) {
      files.set(path, content)
    },
    remove(path) {
      origins.delete(path)
      return files.delete(path)
    },
    rename(from, to) {
      if (from === to) return
      const content = files.get(from)
      if (content == null) throw new Error(`No such file: ${from}`)
      const origin = origins.get(from) ?? (original.has(from) ? from : undefined)
      files.delete(from)
      origins.delete(from)
      files.set(to, content)
      if (origin && origin !== to) origins.set(to, origin)
      else origins.delete(to)
    },
    list(dir) {
      const prefix = under(dir)
      return [...files.keys()].filter((path) => path.startsWith(prefix))
    },
    dirs(dir) {
      const prefix = under(dir)
      const names = new Set<string>()
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        const cut = rest.indexOf('/')
        if (cut !== -1) names.add(rest.slice(0, cut))
      }
      return [...names]
    },
    isDir(path) {
      const prefix = under(path)
      if (prefix === '') return true
      for (const file of files.keys()) if (file.startsWith(prefix)) return true
      return false
    },
    changes() {
      const written = new Map<string, string>()
      for (const [path, content] of files) if (original.get(path) !== content) written.set(path, content)
      const removed = [...original.keys()].filter((path) => !files.has(path))
      // A move counts only while it still describes the result: the file is at
      // its new place and nothing took the old one back.
      const moved = new Map<string, string>()
      for (const [to, from] of origins) if (files.has(to) && !files.has(from)) moved.set(to, from)
      return { written, removed, moved }
    },
  }
}
