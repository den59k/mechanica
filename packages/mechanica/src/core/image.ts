import { computed, defineComponent, h, onMounted, ref, type PropType } from 'vue'

/** The image field's stored value (see `builtinFields` in `mechanica-shared`). */
export interface ImageValue {
  src: string
  /** A tiny LQIP data URI captured at upload, or a server-provided preview. */
  previewSrc?: string
  alt?: string
  /** Intrinsic pixel size captured when the image was chosen. */
  width?: number
  height?: number
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

    const lqipStyle = computed(() => {
      const preview = props.image?.previewSrc
      // Only a real preview counts — `previewSrc === src` is the uploader's
      // no-preview fallback. Cleared once loaded, so transparent images don't
      // keep a blurred backdrop behind them.
      if (loaded.value || !preview || preview === props.image?.src) return undefined
      return {
        backgroundImage: `url("${preview}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    })

    return () => {
      const image = props.image
      if (!image?.src) return null
      return h('img', {
        ref: el,
        src: image.src,
        alt: image.alt ?? '',
        width: image.width,
        height: image.height,
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
