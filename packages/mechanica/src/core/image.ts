import { computed, defineComponent, h, onMounted, ref, type PropType } from 'vue'

/** The image field's stored value (see `builtinFields` in `mechanica-shared`). */
export interface ImageValue {
  src: string
  /** A tiny LQIP data URI captured at upload, or a server-provided preview. */
  previewSrc?: string
  alt?: string
  /** Intrinsic pixel size of the original, captured when the image was chosen. */
  width?: number
  height?: number
  /** Focal point (0..1), relative to the rendered image (the crop when present). */
  focalX?: number
  focalY?: number
  /** Normalized crop rectangle over the original (see the crop dialog). */
  crop?: { x: number; y: number; width: number; height: number }
  /** The baked cropped + downscaled derivative, rendered in place of `src`. */
  croppedSrc?: string
  croppedWidth?: number
  croppedHeight?: number
}

/**
 * The focal point as a CSS position string (`"32% 68%"`), or `undefined` when no
 * focal point is set (leave the browser's default). Use it for `object-position`
 * or, when a block paints an image field as a CSS `background-image`, for
 * `background-position` — the feature the focal point exists to serve.
 */
export function imagePosition(image?: ImageValue | null): string | undefined {
  if (!image || (image.focalX == null && image.focalY == null)) return undefined
  const pct = (n: number | undefined) => `${Math.round((n ?? 0.5) * 1000) / 10}%`
  return `${pct(image.focalX)} ${pct(image.focalY)}`
}

/**
 * The single image component: renders an image-field value with everything a
 * fast, SEO-clean page needs — `alt`, intrinsic `width`/`height` (the browser
 * reserves the box, no layout shift), native `loading="lazy"` +
 * `decoding="async"`, and the field's LQIP `previewSrc` painted as a blurred
 * inline background until the real image loads (a data URI costs no request,
 * so heroes show *something* on first paint).
 *
 * Above-the-fold images must not be lazy — pass `eager` to fetch immediately
 * at high priority (`loading="eager"` + `fetchpriority="high"`).
 *
 * Renders nothing while no image is chosen (the field-default convention).
 */
export const Image = defineComponent({
  name: 'MechImage',
  props: {
    image: { type: Object as PropType<ImageValue | null>, default: null },
    /** Above-the-fold (hero/LCP) image: fetch immediately at high priority. */
    eager: { type: Boolean, default: false },
  },
  setup(props) {
    const el = ref<HTMLImageElement>()
    const loaded = ref(false)
    // The image may finish loading before hydration attaches the load listener.
    onMounted(() => {
      if (el.value?.complete) loaded.value = true
    })

    // The focal point aligns both the blur-up backdrop and (below) the img's
    // own `object-position`, so a block that sizes the image with `object-fit`
    // keeps the subject in frame.
    const position = computed(() => imagePosition(props.image))

    const lqipStyle = computed(() => {
      const image = props.image
      const preview = image?.previewSrc
      // Only a real preview counts — `previewSrc === src` is the uploader's
      // no-preview fallback. Cleared once loaded, so transparent images don't
      // keep a blurred backdrop behind them.
      const style: Record<string, string> = {}
      if (position.value) style.objectPosition = position.value
      if (!loaded.value && preview && preview !== image?.src) {
        style.backgroundImage = `url("${preview}")`
        style.backgroundSize = 'cover'
        style.backgroundPosition = position.value ?? 'center'
        style.backgroundRepeat = 'no-repeat'
      }
      return Object.keys(style).length ? style : undefined
    })

    return () => {
      const image = props.image
      if (!image?.src && !image?.croppedSrc) return null
      // A crop bakes a downscaled derivative — render it (and its own intrinsic
      // size) in place of the original; fall back to the original otherwise.
      const cropped = !!image.croppedSrc
      return h('img', {
        ref: el,
        src: cropped ? image.croppedSrc : image.src,
        alt: image.alt ?? '',
        width: (cropped ? image.croppedWidth : image.width) ?? undefined,
        height: (cropped ? image.croppedHeight : image.height) ?? undefined,
        loading: props.eager ? 'eager' : 'lazy',
        fetchpriority: props.eager ? 'high' : undefined,
        decoding: 'async',
        style: lqipStyle.value,
        onLoad: () => {
          loaded.value = true
        },
      })
    }
  },
})
