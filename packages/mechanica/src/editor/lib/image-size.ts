/** Largest dimension below which no LQIP is generated — icons stay as-is. */
const LQIP_MIN_DIMENSION = 256
/** Pixel width of the generated LQIP preview. */
const LQIP_WIDTH = 24

export interface ImageFileInfo {
  width: number
  height: number
  /** A ~24px blurred-preview data URI (≈1 KB), present for large images. */
  lqip?: string
}

/**
 * Decode an image file locally: intrinsic dimensions plus — for images of
 * {@link LQIP_MIN_DIMENSION}+ — a tiny data-URI preview for `<Image>`'s
 * blur-up. Runs entirely in the browser (createImageBitmap + canvas), so no
 * server-side image library is needed. Resolves `null` when the file can't be
 * decoded (unsupported format, SVG, jsdom) — callers fall back gracefully.
 */
export async function analyzeImageFile(file: Blob): Promise<ImageFileInfo | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const info: ImageFileInfo = { width, height }
    if (Math.max(width, height) >= LQIP_MIN_DIMENSION) {
      const canvas = document.createElement('canvas')
      canvas.width = LQIP_WIDTH
      canvas.height = Math.max(1, Math.round((height / width) * LQIP_WIDTH))
      const context = canvas.getContext('2d')
      if (context) {
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        // toDataURL falls back to PNG where WebP encoding is unsupported.
        const uri = canvas.toDataURL('image/webp', 0.6)
        if (uri.startsWith('data:image/')) info.lqip = uri
      }
    }
    bitmap.close()
    return info
  } catch {
    return null
  }
}

/**
 * {@link analyzeImageFile} for an already-uploaded URL: fetch the file and
 * decode it locally. This is how *library picks* get dimensions + LQIP — there
 * is no `File` in hand, only the asset's src. Null on any failure.
 */
export async function analyzeImageUrl(src: string): Promise<ImageFileInfo | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    return await analyzeImageFile(await response.blob())
  } catch {
    return null
  }
}

/** Largest dimension a free (unsized) crop derivative is downscaled to. */
const CROP_MAX_DIMENSION = 2560
/** WebP quality for cropped derivatives — the real rendered image, not an LQIP. */
const CROP_QUALITY = 0.85

/** A normalized crop rectangle (0..1) over the source image. */
export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

/** Desired output box for a crop; when both set the derivative is downscaled into it. */
export interface CropTarget {
  width?: number
  height?: number
}

export interface CroppedImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Crop + downscale an image entirely in the browser (createImageBitmap + canvas):
 * take the {@link NormalizedRect} region of the source at `src`, scale it to fit
 * `target` (or capped at {@link CROP_MAX_DIMENSION} when no target), and encode a
 * WebP blob. Never upscales. Resolves `null` when the source can't be fetched or
 * decoded (SVG, CORS, jsdom) — the caller keeps the focal-only path. The blob is
 * uploaded as a derived asset; `width`/`height` are its intrinsic size.
 */
export async function renderCrop(
  src: string,
  rect: NormalizedRect,
  target: CropTarget = {},
): Promise<CroppedImage | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const bitmap = await createImageBitmap(await response.blob())
    const sx = rect.x * bitmap.width
    const sy = rect.y * bitmap.height
    const sw = rect.width * bitmap.width
    const sh = rect.height * bitmap.height
    if (sw < 1 || sh < 1) {
      bitmap.close()
      return null
    }
    // Downscale to fit the target box, or cap the long edge — never above 1×.
    const scale =
      target.width && target.height
        ? Math.min(1, target.width / sw, target.height / sh)
        : Math.min(1, CROP_MAX_DIMENSION / Math.max(sw, sh))
    const outW = Math.max(1, Math.round(sw * scale))
    const outH = Math.max(1, Math.round(sh * scale))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return null
    }
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH)
    bitmap.close()

    const blob = await canvasToBlob(canvas, 'image/webp', CROP_QUALITY)
    return blob ? { blob, width: outW, height: outH } : null
  } catch {
    return null
  }
}

/** Promisified `canvas.toBlob` (jsdom lacks it → null, caller falls back). */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality))
}

/**
 * Intrinsic pixel size of an image URL, via the browser's image loader.
 * Resolves `null` when the image can't be loaded or reports no size — callers
 * simply skip the dimensions then, never fail.
 */
export function readImageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () =>
      resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null)
    image.onerror = () => resolve(null)
    image.src = src
  })
}
