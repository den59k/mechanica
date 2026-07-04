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
