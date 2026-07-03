import { computed, defineComponent, h, inject, type PropType } from 'vue'
import type { PageLink } from 'mechanica-shared'
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
 */
export const Link = defineComponent({
  name: 'MechLink',
  props: {
    to: { type: [String, Object] as PropType<LinkTarget>, required: true },
    activeClass: { type: String, default: 'is-active' },
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
      const isActive = url === router.currentRoute.path
      return h(
        'a',
        {
          href: router.normalizePath(url),
          ...newTab,
          class: isActive ? props.activeClass : undefined,
          onClick: (event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            if (event.button !== 0 || openNewTab) return
            event.preventDefault()
            void router.push(url)
          },
        },
        children,
      )
    }
  },
})
