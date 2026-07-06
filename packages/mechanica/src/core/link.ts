import { computed, defineComponent, h, inject, type PropType } from 'vue'
import { localePath, type PageLink } from 'mechanica-shared'
import { mechanicaKey } from './state'

/** A string path, or a `smartLink`-shaped target. */
export type LinkTarget = string | Partial<PageLink>

interface ResolvedTarget {
  url: string
  title?: string
  external: boolean
  openNewTab: boolean
}

function resolveTarget(to: LinkTarget): ResolvedTarget {
  if (typeof to === 'string') {
    return { url: to, external: /^https?:\/\//.test(to), openNewTab: false }
  }
  return {
    url: to.url ?? '',
    title: to.title,
    external: to.external ?? false,
    openNewTab: to.openNewTab ?? false,
  }
}

/**
 * The single link component. Resolves a string path or a `smartLink` object:
 * internal targets navigate via the SPA router, external targets render a plain
 * `<a>`. Replaces v1's separate `RouterLink` / `SmartLink`.
 *
 * On a multi-language site an internal `to` is a **logical** path (`/about`);
 * `<Link>` prefixes it for the current page's locale (`/ru/about`), so authors
 * store logical paths and links resolve to the right language automatically.
 * Pass `:locale` to target a specific locale instead — the shape a language
 * switcher uses (`<Link :to="page.path" :locale="code">`).
 */
export const Link = defineComponent({
  name: 'MechLink',
  props: {
    to: { type: [String, Object] as PropType<LinkTarget>, required: true },
    /**
     * Class added to the anchor when its resolved path matches the current route.
     * Pass `false` (or `''`) to disable — e.g. a language switcher that tracks the
     * active *locale* itself, where every locale link points at the same logical
     * page and path-matching is the wrong signal.
     */
    activeClass: { type: [String, Boolean] as PropType<string | false>, default: 'is-active' },
    /** Target a specific locale instead of the current one (language switchers). */
    locale: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    const ctx = inject(mechanicaKey)
    const target = computed(() => resolveTarget(props.to))

    return () => {
      const { url, title, external, openNewTab } = target.value
      const children = slots.default ? slots.default() : title
      const newTab = openNewTab ? { target: '_blank', rel: 'noopener' } : {}

      if (external || !ctx) {
        return h('a', { href: url, ...newTab }, children)
      }

      const router = ctx.router
      // Prefix internal logical paths for the target (or current) locale.
      const locale = props.locale ?? ctx.page?.locale
      const resolved = ctx.locales ? localePath(url, locale, ctx.locales) : url
      const isActive = router.normalizePath(resolved) === router.currentRoute.path
      return h(
        'a',
        {
          href: router.normalizePath(resolved),
          ...newTab,
          class: (isActive && props.activeClass) || undefined,
          onClick: (event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            if (event.button !== 0 || openNewTab) return
            event.preventDefault()
            void router.push(resolved)
          },
        },
        children,
      )
    }
  },
})
