import { computed, defineComponent, h, inject, type Component, type ComputedRef } from 'vue'
import { Content } from './content'
import { mechanicaKey } from './state'
import type { MechanicaContext } from './state'

/**
 * Resolve the active layout name for a page: its `layout` when the app's map
 * knows it, else the map's first (default) entry. Empty string when the app
 * declares no layouts.
 */
export function resolveLayoutName(
  layouts: Record<string, Component> | undefined,
  pageLayout: string | undefined,
): string {
  if (!layouts) return ''
  const names = Object.keys(layouts)
  if (names.length === 0) return ''
  return pageLayout && pageLayout in layouts ? pageLayout : names[0]!
}

export interface UseLayout {
  /** The active layout's name (reactive; '' when the app declares no layouts). */
  name: ComputedRef<string>
  /** The app's layout names, in declaration order (first = default). */
  names: string[]
}

/**
 * The current page's layout. Reactive across SPA navigation and in-editor page
 * switches — `page.layout` rides the page meta the router applies.
 */
export function useLayout(): UseLayout {
  const ctx = inject(mechanicaKey)
  if (!ctx) throw new Error('[mechanica] useLayout used outside a Mechanica app')
  return {
    name: computed(() => resolveLayoutName(ctx.layouts, ctx.page.layout)),
    names: ctx.layouts ? Object.keys(ctx.layouts) : [],
  }
}

/**
 * Renders the page's active layout component (which itself renders `<Content/>`
 * inside its chrome). Place once in the root component. With no `layouts`
 * declared on the app this is `<Content/>` — so a single-shell site can adopt
 * it without declaring anything.
 */
export const Layout = defineComponent({
  name: 'MechLayout',
  setup() {
    const ctx = inject(mechanicaKey) as MechanicaContext | undefined
    if (!ctx) {
      throw new Error('[mechanica] <Layout> was used without createMechanica() installed')
    }
    return () => {
      const name = resolveLayoutName(ctx.layouts, ctx.page.layout)
      const component = name ? ctx.layouts![name]! : null
      // Key by layout name so switching layouts remounts the shell cleanly
      // (headers/sidebars don't try to patch across unrelated trees).
      return component ? h(component, { key: name }) : h(Content)
    }
  },
})
