import { vi } from 'vitest'

/**
 * jsdom never loads images, so `readImageSize` (the editor's dimension capture
 * on image pick/upload) would hang forever. This stub reports a fixed 640×480
 * via the normal onload path, making the capture deterministic in DOM tests.
 * Pair with `vi.unstubAllGlobals()` in afterEach.
 */
export function stubImageLoading(): void {
  class StubImage {
    naturalWidth = 0
    naturalHeight = 0
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) {
      this.naturalWidth = 640
      this.naturalHeight = 480
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', StubImage)
}
