import type { CropTarget, NormalizedRect } from './image-size'

/** URL prefix uploaded assets are served under (mirrors the dev assets-store). */
const UPLOADS_PREFIX = '/@mechanica/assets/'

/** The image-field value as the editor holds it (see `builtinFields` in shared). */
export interface EditorImageValue {
  src: string
  previewSrc?: string
  alt?: string
  width?: number
  height?: number
  focalX?: number
  focalY?: number
  crop?: NormalizedRect
  croppedSrc?: string
  croppedWidth?: number
  croppedHeight?: number
}

/** The crop config resolved from a field's `crop` annotation. */
export interface ResolvedCrop {
  /** Locked crop ratio (width / height); `undefined` means a free frame. */
  aspect?: number
  /** Output box the derivative is downscaled into, when both are given. */
  targetWidth?: number
  targetHeight?: number
}

const positive = (n: unknown): number | undefined =>
  typeof n === 'number' && isFinite(n) && n > 0 ? n : undefined

/**
 * Resolve a field's `crop` annotation into cropping intent, or `null` when the
 * field doesn't opt into a crop frame (focal-point editing is still offered).
 * `true` → free crop; `{ width, height }` → aspect-locked + downscaled to that
 * box; `{ aspect }` → ratio lock without a size cap.
 */
export function resolveCropConfig(crop: unknown): ResolvedCrop | null {
  if (!crop) return null
  if (crop === true) return {}
  if (typeof crop !== 'object') return null
  const c = crop as { width?: unknown; height?: unknown; aspect?: unknown }
  const targetWidth = positive(c.width)
  const targetHeight = positive(c.height)
  if (targetWidth && targetHeight) return { aspect: targetWidth / targetHeight, targetWidth, targetHeight }
  const aspect = positive(c.aspect)
  return aspect ? { aspect } : {}
}

/** The output box a resolved crop downscales its derivative into (empty when free). */
export function cropTarget(config: ResolvedCrop): CropTarget {
  return config.targetWidth && config.targetHeight
    ? { width: config.targetWidth, height: config.targetHeight }
    : {}
}

/** Clamp a number to the 0..1 range. */
export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * The largest centered crop rectangle of the given aspect (width / height) that
 * fits an `imgW`×`imgH` image, in normalized (0..1) coordinates. Without an
 * aspect (a free crop) the whole frame is returned.
 */
export function defaultCropRect(aspect: number | undefined, imgW: number, imgH: number): NormalizedRect {
  if (!aspect || !imgW || !imgH) return { x: 0, y: 0, width: 1, height: 1 }
  const imgAspect = imgW / imgH
  const width = Math.min(1, aspect / imgAspect)
  const height = Math.min(1, imgAspect / aspect)
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

/**
 * The normalized rect's width/height ratio for a pixel aspect (width/height) on
 * an `imgW`×`imgH` image — the ratio the crop box must keep in 0..1 space.
 */
export function normalizedAspect(pixelAspect: number, imgW: number, imgH: number): number {
  return pixelAspect / (imgW / imgH)
}

/**
 * Resize a crop rect by dragging a corner: `anchor` is the fixed opposite corner,
 * `pointer` the dragged corner (both normalized). With `aspectN` (a normalized
 * width/height ratio) the rect keeps that ratio, growing to follow the pointer
 * and shrinking to stay in-frame; without it each axis is free. `minSize` floors
 * the smaller dimension.
 */
export function resizeRect(
  anchor: { x: number; y: number },
  pointer: { x: number; y: number },
  aspectN?: number,
  minSize = 0.04,
): NormalizedRect {
  const px = clamp01(pointer.x)
  const py = clamp01(pointer.y)
  const sx = px >= anchor.x ? 1 : -1
  const sy = py >= anchor.y ? 1 : -1
  const maxW = sx > 0 ? 1 - anchor.x : anchor.x
  const maxH = sy > 0 ? 1 - anchor.y : anchor.y

  let w: number
  let h: number
  if (aspectN) {
    w = Math.max(Math.abs(px - anchor.x), Math.abs(py - anchor.y) * aspectN, minSize)
    h = w / aspectN
    const f = Math.min(1, w > 0 ? maxW / w : 1, h > 0 ? maxH / h : 1)
    w *= f
    h = w / aspectN
  } else {
    w = Math.min(Math.max(Math.abs(px - anchor.x), minSize), maxW)
    h = Math.min(Math.max(Math.abs(py - anchor.y), minSize), maxH)
  }
  const cornerX = anchor.x + sx * w
  const cornerY = anchor.y + sy * h
  return { x: Math.min(anchor.x, cornerX), y: Math.min(anchor.y, cornerY), width: w, height: h }
}

/** Shift a rect so it stays within the 0..1 frame, preserving its size. */
export function clampRectPosition(rect: NormalizedRect): NormalizedRect {
  return {
    width: rect.width,
    height: rect.height,
    x: Math.min(Math.max(rect.x, 0), Math.max(0, 1 - rect.width)),
    y: Math.min(Math.max(rect.y, 0), Math.max(0, 1 - rect.height)),
  }
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000

/**
 * A deterministic filename for a cropped derivative: `<base>.crop-<hash>.webp`.
 * The hash covers the source plus the crop rect and target box, so re-cropping
 * to the same frame reuses the same file (idempotent overwrite) while a
 * different frame lands a new one. `isDerivedAsset` on the server matches it.
 */
export function derivativeName(src: string, rect: NormalizedRect, target: CropTarget): string {
  const key = JSON.stringify({
    f: src,
    x: round4(rect.x),
    y: round4(rect.y),
    w: round4(rect.width),
    h: round4(rect.height),
    tw: target.width ?? 0,
    th: target.height ?? 0,
  })
  return `${baseName(src)}.crop-${hashString(key)}.webp`
}

/** A readable, filename-safe stem for an asset src (`hero` from `…/hero.png`). */
function baseName(src: string): string {
  if (!src.startsWith(UPLOADS_PREFIX)) return 'image'
  let file = src.slice(UPLOADS_PREFIX.length)
  try {
    file = decodeURIComponent(file)
  } catch {
    /* keep the raw value */
  }
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  return stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
}

/** A small, stable FNV-1a string hash rendered in base36 (naming only, not crypto). */
export function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
