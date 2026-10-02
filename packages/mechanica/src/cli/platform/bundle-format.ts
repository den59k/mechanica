import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The bundle `mechanica push` uploads: the built `dist/` for one commit, as one
 * request body.
 *
 *   "MCHB" | u32 LE header length | header JSON | the files' bytes, in header order
 *   header = { format: 1, commit, engine, files: [ { path, size } ] }
 *
 * `commit` ties the bundle to the source it was built from; `engine` (this
 * package's version) tells the platform which export code to render it with.
 * Paths are relative to `dist/`, forward-slashed, sorted — the same build always
 * produces the same header.
 */
export const BUNDLE_MAGIC = 'MCHB'
export const BUNDLE_FORMAT = 1

export interface BundleHeader {
  format: typeof BUNDLE_FORMAT
  /** The full id of the commit the bundle was built from. */
  commit: string
  /** The mechanica version that built it. */
  engine: string
  files: { path: string; size: number }[]
}

/** Every file under `dir`, as forward-slashed paths relative to it, sorted. */
export async function listBundleFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1).replace(/\\/g, '/'))
    .sort()
}

/** Serialize already-read files into a bundle body. */
export function encodeBundle(
  meta: { commit: string; engine: string },
  files: { path: string; data: Uint8Array }[],
): Uint8Array {
  const header: BundleHeader = {
    format: BUNDLE_FORMAT,
    commit: meta.commit,
    engine: meta.engine,
    files: files.map((file) => ({ path: file.path, size: file.data.length })),
  }
  const head = new TextEncoder().encode(JSON.stringify(header))
  const total = 8 + head.length + files.reduce((sum, file) => sum + file.data.length, 0)

  const body = new Uint8Array(total)
  body.set(new TextEncoder().encode(BUNDLE_MAGIC), 0)
  new DataView(body.buffer).setUint32(4, head.length, true)
  body.set(head, 8)
  let offset = 8 + head.length
  for (const file of files) {
    body.set(file.data, offset)
    offset += file.data.length
  }
  return body
}

/** Read a built `dist/` and pack it for upload. */
export async function packBundle(distDir: string, meta: { commit: string; engine: string }): Promise<Uint8Array> {
  const paths = await listBundleFiles(distDir)
  const files = await Promise.all(
    paths.map(async (path) => ({ path, data: new Uint8Array(await readFile(join(distDir, path))) })),
  )
  return encodeBundle(meta, files)
}
