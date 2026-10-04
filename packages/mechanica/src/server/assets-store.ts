import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join, parse, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { UPLOADS_PREFIX, uploadNameOf, walkSchema, walkTree, type Block, type ContentBlock } from 'mechanica-shared'
import { analyzeImageBuffer, isRasterImage, type ServerImageInfo } from './image-preview'
import { writeFileAtomic } from './fs-utils'

/** The URL prefix uploaded assets are referenced by in page data. */
export { UPLOADS_PREFIX }

/** The address an upload is referenced by and served at. */
const assetUrl = (fileName: string) => `${UPLOADS_PREFIX}${fileName}`

/**
 * Cropped-derivative filenames (`<name>.crop-<hash>.webp`) — the non-destructive
 * crop's baked output. They are stored alongside originals (so the export copies
 * them like any other upload) but are hidden from the image library picker and
 * excluded from the "orphaned upload" warning: they are a regenerable cache
 * keyed off the original + crop params, not source files.
 */
const DERIVED_RE = /\.crop-[a-z0-9]+\.webp$/i

/** Whether a filename is a cropped derivative (see {@link DERIVED_RE}). */
export function isDerivedAsset(fileName: string): boolean {
  return DERIVED_RE.test(fileName)
}

/** The asset filename an uploaded-asset src refers to, or null for other URLs. */
export const assetFileOf = uploadNameOf

/**
 * The name an upload is stored under: the file's own name plus a short hash of
 * its content (`photo.jpg` → `photo-9f2c1a7b.jpg`). A stored name therefore
 * never changes what it holds — the same name is the same file wherever it was
 * uploaded (the dev server, a hosted editor), so two places can never disagree
 * about `photo.jpg`, and uploading a file twice stores it once.
 */
export function uploadName(fileName: string, data: Uint8Array): string {
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 8)
  // Only the last path segment: a name is never a path.
  const { name, ext } = parse(fileName.replace(/\\/g, '/').split('/').pop() || 'file')
  return name.endsWith(`-${hash}`) ? `${name}${ext}` : `${name}-${hash}${ext}`
}

// --- Image info -----------------------------------------------------------
//
// Derived image metadata — intrinsic dimensions and the LQIP blur-up preview —
// is kept by the asset store, keyed by asset filename, NOT in the page files:
// `.page.md` stays human-readable (no base64 blobs), and an asset used by five
// pages stores its preview once. The editor service and the export inject the
// entries back into image field values at state-build time. On disk the store
// keeps it in `<mechDir>/images.json` — the two functions below.

const MANIFEST_FILE = 'images.json'

export interface ImageManifestEntry {
  width?: number
  height?: number
  /** A ~24px blurred-preview data URI (see `<Image>`'s blur-up). */
  previewSrc?: string
}

export type ImageManifest = Record<string, ImageManifestEntry>

/** Read `<mechDir>/images.json`; an empty manifest when missing/corrupt. */
export function readImageManifest(mechDir: string): ImageManifest {
  try {
    return JSON.parse(fs.readFileSync(join(mechDir, MANIFEST_FILE), 'utf-8')) as ImageManifest
  } catch {
    return {}
  }
}

/** Merge entries into the manifest, writing only when something changed. */
export function updateImageManifest(mechDir: string, entries: ImageManifest): void {
  if (!Object.keys(entries).length) return
  const manifest = readImageManifest(mechDir)
  let changed = false
  for (const [file, entry] of Object.entries(entries)) {
    const current = manifest[file]
    const next: ImageManifestEntry = { ...current }
    if (entry.width) next.width = entry.width
    if (entry.height) next.height = entry.height
    if (entry.previewSrc) next.previewSrc = entry.previewSrc
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      manifest[file] = next
      changed = true
    }
  }
  if (changed) writeFileAtomic(join(mechDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
}

/** An image field value as stored in page data. */
interface ImageValue {
  src?: unknown
  previewSrc?: string
  width?: number
  height?: number
}

/** Visit every uploaded-asset image value in a content tree. */
function visitUploadedImages(
  content: ContentBlock[],
  blocks: Map<string, Block>,
  visit: (value: ImageValue, file: string) => void,
): void {
  walkTree(content, (block) => {
    const meta = blocks.get(block.blockId)
    if (!meta?.props) return
    walkSchema(block.data, meta.props, (value: any, schema: any) => {
      if (schema.format !== 'image') return
      const file = assetFileOf(value?.src)
      if (file) visit(value as ImageValue, file)
    })
  })
}

/** The uploaded images a content tree refers to, by stored name. */
export function contentImageNames(content: ContentBlock[], blocks: Map<string, Block>): string[] {
  const names = new Set<string>()
  visitUploadedImages(content, blocks, (_value, file) => names.add(file))
  return [...names]
}

/**
 * Pull derived image metadata out of page content before it is persisted:
 * data-URI previews (and the legacy `previewSrc === src` fallback) are
 * REMOVED from the values — they belong with the asset store, not in
 * `.page.md` — and returned (with any dimensions) as entries to save.
 */
export function harvestImageMeta(content: ContentBlock[], blocks: Map<string, Block>): ImageManifest {
  const entries: ImageManifest = {}
  visitUploadedImages(content, blocks, (value, file) => {
    const entry: ImageManifestEntry = entries[file] ?? {}
    if (value.width && value.height) {
      entry.width = value.width
      entry.height = value.height
    }
    if (value.previewSrc?.startsWith('data:')) entry.previewSrc = value.previewSrc
    if (value.previewSrc?.startsWith('data:') || value.previewSrc === value.src) {
      delete value.previewSrc
    }
    if (Object.keys(entry).length) entries[file] = entry
  })
  return entries
}

/**
 * The inverse of {@link harvestImageMeta}: fill missing `previewSrc` /
 * dimensions in image field values from the stored info. Values that already
 * carry their own (a page authored with explicit metadata) win.
 */
export function applyImageManifest(
  content: ContentBlock[],
  blocks: Map<string, Block>,
  manifest: ImageManifest,
): void {
  visitUploadedImages(content, blocks, (value, file) => {
    const entry = manifest[file]
    if (!entry) return
    if (entry.previewSrc && !value.previewSrc) value.previewSrc = entry.previewSrc
    if (entry.width && !value.width) value.width = entry.width
    if (entry.height && !value.height) value.height = entry.height
  })
}

// --- The asset store ------------------------------------------------------

/**
 * Where a site's uploads live — the files themselves and what is known about
 * the images among them. The editor service reaches uploads only through this,
 * so a host keeps them wherever it wants (a directory; object storage and a
 * database table). A name is one flat filename and, apart from re-cropped
 * derivatives, is written once (see {@link uploadName}).
 */
export interface AssetStore {
  /** Store a file under `name`, replacing one already there. */
  write(name: string, data: Uint8Array): Promise<void>
  /** The file's bytes, or null when there is no such upload. */
  open(name: string): Promise<ReadableStream<Uint8Array> | Uint8Array | null>
  /** The names of every stored file. */
  list(): Promise<string[]>
  /** What is known about the images among `names`; unknown names are absent. */
  info(names: string[]): Promise<ImageManifest>
  /** Merge image info in — an entry adds to what is already known about a name. */
  saveInfo(entries: ImageManifest): Promise<void>
}

/** A flat filename: no separators, no traversal. */
export const isAssetName = (name: string): boolean =>
  name !== '' && name !== '.' && name !== '..' && !/[\\/\0]/.test(name)

/** The uploads of a `.mech` directory: files in `assets/`, image info in `images.json`. */
export function fsAssetStore(mechDir: string): AssetStore {
  const dir = resolve(mechDir, 'assets')
  // Contained even for a name that slipped past `isAssetName`.
  const fileOf = (name: string): string | null => {
    const file = resolve(dir, name)
    return file.startsWith(dir + sep) ? file : null
  }
  return {
    async write(name, data) {
      const file = fileOf(name)
      if (!file) throw new Error(`Invalid asset name: ${name}`)
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(file, data)
    },
    async open(name) {
      const file = fileOf(name)
      if (!file || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return null
      return Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>
    },
    async list() {
      return fs.existsSync(dir) ? fs.readdirSync(dir) : []
    },
    async info(names) {
      const manifest = readImageManifest(mechDir)
      const out: ImageManifest = {}
      for (const name of names) if (manifest[name]) out[name] = manifest[name]
      return out
    },
    async saveInfo(entries) {
      updateImageManifest(mechDir, entries)
    },
  }
}

/**
 * Store an uploaded file, returning its public src. A regular upload gets its
 * content-hashed name; for raster images the answer also carries intrinsic
 * dimensions + an LQIP `previewSrc` when the optional `sharp` dependency is
 * installed (the editor falls back to its own canvas-based capture otherwise),
 * and they are saved as the image's info. A `derived` upload — a cropped
 * derivative — keeps the deterministic name the client computed (re-cropping to
 * the same rect overwrites) and gets no info: it reuses the original's blur-up.
 */
export async function storeUpload(
  assets: AssetStore,
  fileName: string,
  data: Uint8Array,
  options: { derived?: boolean } = {},
): Promise<{ src: string; name: string } & ServerImageInfo> {
  if (options.derived) {
    if (!isAssetName(fileName)) throw new Error(`Invalid asset name: ${fileName}`)
    await assets.write(fileName, data)
    return { src: assetUrl(fileName), name: fileName }
  }
  const stored = uploadName(fileName, data)
  await assets.write(stored, data)
  const info = isRasterImage(stored) ? await analyzeImageBuffer(Buffer.from(data)) : null
  if (info) await assets.saveInfo({ [stored]: info })
  return { src: assetUrl(stored), name: fileName, ...info }
}

/** The uploads offered by the image picker — cropped derivatives are hidden (see {@link isDerivedAsset}). */
export async function listUploads(assets: AssetStore): Promise<{ id: string; name: string; src: string }[]> {
  return (await assets.list())
    .filter((name) => !isDerivedAsset(name))
    .map((name) => ({
      id: name.slice(0, name.lastIndexOf('.')) || name,
      name,
      src: assetUrl(name),
    }))
}

// --- Uploads kept elsewhere -----------------------------------------------

/**
 * Where a project's uploads also live — a hosted platform the project is linked
 * to. Uploads made in its online editor are not in the project's directory
 * until something asks for them.
 */
export interface RemoteAssets {
  /** An upload's bytes with what is known about it as an image; null when there is no such upload. */
  fetch(name: string): Promise<{ data: Uint8Array; info?: ImageManifestEntry } | null>
  /** The names of the uploads kept there. */
  list(): Promise<string[]>
}

export interface RemoteAssetsOptions {
  /**
   * Whether a fetched upload is written into the local store. When it is not,
   * the upload is fetched once per process and served from memory — for a
   * project whose uploads directory is under version control, where a file
   * appearing in it would be an uncommitted change.
   */
  cache?: boolean | (() => boolean | Promise<boolean>)
}

// How long a name that was not found remotely is not asked for again.
const MISS_TTL_MS = 30_000
// How much a process keeps of uploads it may not write to disk.
const MEMORY_LIMIT = 64 * 1024 * 1024

/**
 * A store that falls back to {@link RemoteAssets} for what the local one lacks:
 * an upload made in a hosted editor shows up in the dev server the first time a
 * page asks for it, and (when `cache` allows) stays in the project's directory.
 * Everything written goes to the local store; a remote failure is a miss, never
 * an error — the dev server works offline with what it has.
 */
export function withRemoteAssets(local: AssetStore, remote: RemoteAssets, options: RemoteAssetsOptions = {}): AssetStore {
  type Fetched = { data: Uint8Array; info?: ImageManifestEntry } | null
  // One fetch per name: concurrent askers share it, and a miss is remembered
  // (a name that is nobody's upload — a file in `public/media` — is asked often).
  const fetched = new Map<string, Promise<Fetched>>()
  let memory = 0

  const caching = async () => (typeof options.cache === 'function' ? await options.cache() : options.cache !== false)

  const pull = (name: string): Promise<Fetched> => {
    let pending = fetched.get(name)
    if (!pending) {
      pending = (async () => {
        const result = await remote.fetch(name).catch(() => null)
        if (!result) {
          // Not for good: the upload may be made a minute from now.
          const timer = setTimeout(() => fetched.delete(name), MISS_TTL_MS)
          ;(timer as { unref?: () => void }).unref?.()
          return null
        }
        if (await caching()) {
          await local.write(name, result.data)
          if (result.info && Object.keys(result.info).length) await local.saveInfo({ [name]: result.info })
          // On disk now: nothing to hold on to.
          fetched.delete(name)
          return result
        }
        memory += result.data.byteLength
        // Over the limit the bytes are let go; the next request fetches them again.
        if (memory > MEMORY_LIMIT) {
          memory -= result.data.byteLength
          fetched.delete(name)
        }
        return result
      })()
      fetched.set(name, pending)
    }
    return pending
  }

  let remoteNames: { at: number; names: Promise<string[]> } | null = null
  const listRemote = () => {
    if (!remoteNames || Date.now() - remoteNames.at > 30_000) {
      remoteNames = { at: Date.now(), names: remote.list().catch(() => []) }
    }
    return remoteNames.names
  }

  return {
    write: (name, data) => local.write(name, data),
    saveInfo: (entries) => local.saveInfo(entries),
    async open(name) {
      return (await local.open(name)) ?? (await pull(name))?.data ?? null
    },
    async list() {
      return [...new Set([...(await local.list()), ...(await listRemote())])]
    },
    async info(names) {
      const known = await local.info(names)
      const unknown = names.filter((name) => !known[name])
      if (!unknown.length) return known
      // Only names the local store has no file for: a local file without info
      // (not an image, or never analyzed) is not the remote's to describe.
      const here = new Set(await local.list())
      await Promise.all(
        unknown
          .filter((name) => !here.has(name))
          .map(async (name) => {
            const info = (await pull(name))?.info
            if (info && Object.keys(info).length) known[name] = info
          }),
      )
      return known
    },
  }
}
