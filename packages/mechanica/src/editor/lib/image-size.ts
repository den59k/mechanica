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
