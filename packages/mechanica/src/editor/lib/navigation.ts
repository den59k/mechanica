import { ref, type InjectionKey, type Ref } from 'vue'

/**
 * Page navigation surface provided by the editor entry: the reactive current
 * path and an in-place page switch (fetch fresh state + pushState — no full
 * page reload). Components fall back to hard navigation when it is absent
 * (e.g. in isolated component tests).
 */
export interface PageNavigation {
  /** Reactive current page path. */
  readonly path: Ref<string>
  /** Switch the editor to another page in place. Resolves false on failure. */
  switchPage(path: string): Promise<boolean>
}

export const navigationKey: InjectionKey<PageNavigation> = Symbol('mech-navigation')

/** Hard-navigation fallback for contexts without the in-place switcher. */
export function fallbackNavigation(): PageNavigation {
  return {
    path: ref(typeof location !== 'undefined' ? location.pathname : '/'),
    async switchPage(path: string) {
      try {
        location.assign(path)
      } catch {
        /* not available in tests */
      }
      return true
    },
  }
}
