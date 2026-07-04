/**
 * Node-side image analysis via the OPTIONAL `sharp` dependency: intrinsic
 * dimensions plus a tiny LQIP data URI for `<Image>`'s blur-up. Mirrors the
 * editor's client-side `analyzeImageFile` (canvas-based) — this path covers
 * server contexts: the dev upload endpoint and the export backfill.
 *
 * `sharp` is deliberately NOT a dependency of `mechanica` (native binaries).
 * When it isn't installed everything here resolves `null` and callers keep
 * their no-preview behavior; installing `sharp` in the *site's* project is all
 * it takes to turn this on.
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Largest dimension below which no LQIP is generated — icons stay as-is. */
export const LQIP_MIN_DIMENSION = 256
/** Pixel width of the generated LQIP preview. */
const LQIP_WIDTH = 24

/** File extensions sharp can be asked to decode for previews. */
const RASTER_IMAGE_RE = /\.(png|jpe?g|webp|avif|gif|tiff?)$/i

/** Whether a filename looks like a raster image worth analyzing. */
export function isRasterImage(fileName: string): boolean {
  return RASTER_IMAGE_RE.test(fileName)
}

export interface ServerImageInfo {
  width?: number
  height?: number
  /** A ~24px blurred-preview data URI, present for large-enough images. */
  previewSrc?: string
}

/** The minimal slice of sharp's API this module uses. */
type SharpLike = (input: Buffer) => {
  metadata(): Promise<{ width?: number; height?: number }>
  resize(width: number): { webp(options: { quality: number }): { toBuffer(): Promise<Buffer> } }
}

let sharpPromise: Promise<SharpLike | null> | null = null

/** Resolve the optional `sharp` module once per process; null when absent. */
function loadSharp(): Promise<SharpLike | null> {
  if (!sharpPromise) {
    sharpPromise = (async () => {
      // The optional dependency is installed in the *site's* project, not in
      // mechanica — plain `import('sharp')` would resolve from this module's
      // location and never find it. Resolve from the project root (the dev
      // server and CLI both run with cwd there) instead.
      try {
        const requireFromProject = createRequire(join(process.cwd(), 'package.json'))
        return requireFromProject('sharp') as SharpLike
      } catch {
        /* not installed in the project — try normal resolution (hoisted setups) */
      }
      try {
        // A non-literal specifier so neither tsc nor the bundler tries to
        // resolve the optional module at build time.
        const specifier = 'sharp'
        const mod = await import(/* @vite-ignore */ specifier)
        return (mod.default ?? mod) as SharpLike
      } catch {
        return null
      }
    })()
  }
  return sharpPromise
}

/** Test hook: force a (fake) sharp module, or `null` to simulate its absence. */
export function setSharpModule(mod: SharpLike | null | undefined): void {
  sharpPromise = mod === undefined ? null : Promise.resolve(mod)
}

/** Whether the optional `sharp` dependency is installed. */
export async function hasSharp(): Promise<boolean> {
  return (await loadSharp()) !== null
}

/**
 * Analyze an image buffer: intrinsic dimensions plus — for images of
 * {@link LQIP_MIN_DIMENSION}+ — the LQIP data URI. Resolves `null` when
 * `sharp` is not installed or the buffer can't be decoded.
 */
export async function analyzeImageBuffer(buffer: Buffer): Promise<ServerImageInfo | null> {
  const sharp = await loadSharp()
  if (!sharp) return null
  try {
    const image = sharp(buffer)
    const { width, height } = await image.metadata()
    const info: ServerImageInfo = { width, height }
    if (width && height && Math.max(width, height) >= LQIP_MIN_DIMENSION) {
      const preview = await image.resize(LQIP_WIDTH).webp({ quality: 60 }).toBuffer()
      info.previewSrc = `data:image/webp;base64,${preview.toString('base64')}`
    }
    return info
  } catch {
    return null
  }
}
