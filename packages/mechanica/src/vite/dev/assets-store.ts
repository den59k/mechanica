import fs from 'node:fs'
import { join, parse } from 'node:path'
import { walkSchema, walkTree, type Block, type ContentBlock } from 'mechanica-shared'
import { analyzeImageBuffer, isRasterImage, type ServerImageInfo } from './image-preview'
import { writeFileAtomic } from './fs-utils'

/** Find a non-colliding filename in `dir`, suffixing `_1`, `_2`, … as needed. */
export function getUniqueName(dir: string, fileName: string): string {
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const { name, ext } = parse(fileName)

  let candidate = fileName
  let counter = 1
  while (existing.includes(candidate)) {
    candidate = `${name}_${counter}${ext}`
    counter++
  }
  return candidate
}

const assetsDir = (mechDir: string) => join(mechDir, 'assets')

/** The URL prefix uploaded assets are referenced by in page data. */
export const UPLOADS_PREFIX = '/@mechanica/assets/'

/** Public URL the dev server serves an asset under. */
const assetUrl = (fileName: string) => `${UPLOADS_PREFIX}${fileName}`

/** The asset filename an uploaded-asset src refers to, or null for other URLs. */
export function assetFileOf(src: unknown): string | null {
  if (typeof src !== 'string' || !src.startsWith(UPLOADS_PREFIX)) return null
  const file = src.slice(UPLOADS_PREFIX.length)
  try {
    return decodeURIComponent(file)
  } catch {
    return file
  }
}

// --- Image manifest -------------------------------------------------------
//
// Derived image metadata — intrinsic dimensions and the LQIP blur-up preview —
// lives in `<mechDir>/images.json`, keyed by asset filename, NOT in the page
// files: `.page.md` stays human-readable (no base64 blobs), and an asset used
// by five pages stores its preview once. The dev server and the export inject
// the entries back into image field values at state-build time.

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

/**
 * Pull derived image metadata out of page content before it is persisted:
 * data-URI previews (and the legacy `previewSrc === src` fallback) are
 * REMOVED from the values — they belong in the manifest, not in `.page.md` —
 * and returned (with any dimensions) as manifest entries to merge.
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
 * dimensions in image field values from the manifest. Values that already
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

/**
 * Persist an uploaded file under `<mechDir>/assets`, returning its public src.
 * For raster images, the response also carries intrinsic dimensions + an LQIP
 * `previewSrc` when the optional `sharp` dependency is installed (the editor
 * falls back to its own canvas-based capture otherwise).
 */
export async function saveUpload(
  mechDir: string,
  fileName: string,
  data: Buffer,
): Promise<{ src: string; name: string } & ServerImageInfo> {
  const dir = assetsDir(mechDir)
  await fs.promises.mkdir(dir, { recursive: true })
  const unique = getUniqueName(dir, fileName)
  await fs.promises.writeFile(join(dir, unique), data)
  const info = isRasterImage(unique) ? await analyzeImageBuffer(data) : null
  if (info) updateImageManifest(mechDir, { [unique]: info })
  return { src: assetUrl(unique), name: fileName, ...info }
}

/** List uploaded images. */
export function listImages(mechDir: string): { id: string; name: string; src: string }[] {
  const dir = assetsDir(mechDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).map((name) => ({
    id: name.slice(0, name.lastIndexOf('.')) || name,
    name,
    src: assetUrl(name),
  }))
}
