import { inject } from 'vue'
import type { PageMeta } from 'mechanica-shared'
import { mechanicaKey } from './state'

/** Read the current page's metadata (title, path, custom meta). */
export function usePageData(): PageMeta {
  const ctx = inject(mechanicaKey)
  if (!ctx) throw new Error('[mechanica] usePageData used outside a Mechanica app')
  return ctx.page
}
