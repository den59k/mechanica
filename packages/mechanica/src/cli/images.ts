import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDerivedAsset, readImageManifest, updateImageManifest, type ImageManifest } from '../vite/dev/assets-store'
import { analyzeImageBuffer, hasSharp, isRasterImage, LQIP_MIN_DIMENSION } from '../vite/dev/image-preview'

export interface ImagesOptions {
  /** Regenerate every entry, not just missing/incomplete ones. */
  force?: boolean
  /** Project root (defaults to the current working directory). */
  cwd?: string
}

/** Whether a manifest entry already carries everything we would generate. */
function isComplete(entry: { width?: number; height?: number; previewSrc?: string } | undefined): boolean {
  if (!entry?.width || !entry.height) return false
  // Small images intentionally get no LQIP — don't re-decode them every run.
  return Boolean(entry.previewSrc) || Math.max(entry.width, entry.height) < LQIP_MIN_DIMENSION
}

/**
 * `mechanica images` — generate image metadata (intrinsic dimensions + LQIP
 * blur-up previews) for every raster file under `.mech/assets` into
 * `.mech/images.json`. The headless counterpart of what the editor captures
 * on upload/pick: pages authored directly as `.page.md` (no browser session)
 * get complete image metadata by running this once after adding assets.
 * Requires the optional `sharp` dependency in the project.
 */
export async function runImages(options: ImagesOptions = {}): Promise<void> {
  const mechDir = join(options.cwd ?? process.cwd(), '.mech')
  if (!(await hasSharp())) {
    throw new Error(
      'mechanica images needs the optional "sharp" dependency — add it to this project ' +
        '(e.g. `bun add -d sharp` / `npm i -D sharp`)',
    )
  }

  const assetsDir = join(mechDir, 'assets')
  const files = ((await readdir(assetsDir, { recursive: true }).catch(() => [])) as string[])
    .map((file) => file.replace(/\\/g, '/'))
    // Skip cropped derivatives — they reuse the original's LQIP, no entry needed.
    .filter((file) => isRasterImage(file) && !isDerivedAsset(file))
  if (!files.length) {
    console.info('No images under .mech/assets — nothing to do')
    return
  }

  const manifest = readImageManifest(mechDir)
  const computed: ImageManifest = {}
  let skipped = 0
  for (const file of files) {
    if (!options.force && isComplete(manifest[file])) {
      skipped++
      continue
    }
    const info = await analyzeImageBuffer(await readFile(join(assetsDir, file)))
    if (info) {
      computed[file] = info
      console.info(`✓ ${file} — ${info.width}×${info.height}${info.previewSrc ? ' + preview' : ''}`)
    } else {
      console.info(`✗ ${file} — could not decode`)
    }
  }

  updateImageManifest(mechDir, computed)
  const summary = skipped ? `, ${skipped} already complete` : ''
  console.info(`Analyzed ${Object.keys(computed).length} image(s)${summary} → .mech/images.json`)
}
