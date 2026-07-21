import { inject, nextTick, shallowReactive, type ShallowRef } from 'vue'
import type { ContentBlock, State } from 'mechanica-shared'
import { mechanicaKey, type MechanicaMode } from './state'

/** Minimal client router surface used by `<Link>`, `useRouter` and `useRoute`. */
export interface MechanicaRouter {
  /** Reactive current route. */
  currentRoute: { path: string }
  /** Navigate to `path` (SPA), updating content/data. */
  push(path: string): Promise<void>
  /** Resolve a path against the configured base URL. */
  normalizePath(path: string): string
}

export interface CreateRouterOptions {
  mode: MechanicaMode
  baseUrl?: string
  /**
   * Awaited with the target page's content before it is swapped in. The lazy
   * client build uses this to fetch block chunks the page needs but the
   * current blocks map doesn't have yet.
   */
  ensureBlocks?: (content: ContentBlock[]) => Promise<void>
  /**
   * Called with the target page's full serialized state right before the
   * content swap — applies its page meta and baked query results to the
   * runtime context.
   */
  applyState?: (state: State) => void
}

/**
 * Create the client-side router. On the server it is inert (no listeners, no
 * navigation); on the client/dev it performs SPA navigation by fetching the
 * target page and swapping the serialized state.
 */
export function createRouter(
  content: ShallowRef<ContentBlock[]>,
  data: Record<string, unknown>,
  options: CreateRouterOptions,
): MechanicaRouter {
  let baseUrl = options.baseUrl ?? ''
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1)

  const isBrowser = options.mode !== 'server' && typeof window !== 'undefined'

  /** Split `/about#faq` into its path and its fragment (`faq`, no `#`). */
  const splitHash = (path: string): { path: string; hash: string } => {
    const index = path.indexOf('#')
    if (index === -1) return { path, hash: '' }
    return { path: path.slice(0, index), hash: path.slice(index + 1) }
  }

  const normalizePath = (path: string): string => {
    // Normalize the path part only, then put the fragment back: a bare `#faq`
    // stays `#faq` (a same-page anchor), and `/about/#faq` still loses the
    // trailing slash. `currentRoute.path` is always the fragment-less form.
    const { path: bare, hash } = splitHash(path)
    let next = baseUrl + bare
    if (next.endsWith('/') && next !== '/') next = next.slice(0, -1)
    return hash ? `${next}#${hash}` : next
  }

  const stripBase = (path: string): string => {
    if (!baseUrl) return path
    return path.startsWith(baseUrl) ? path.slice(baseUrl.length) : path
  }

  const initialPath = isBrowser ? normalizePath(stripBase(window.location.pathname)) : '/'
  const currentRoute = shallowReactive({ path: initialPath })

  const cache = new Map<string, State>()
  const inflight = new Map<string, Promise<void>>()

  const fetchPage = (path: string): Promise<void> | undefined => {
    if (cache.has(path)) return
    const existing = inflight.get(path)
    if (existing) return existing

    const run = async () => {
      const html = await fetch(path).then((res) => res.text())
      const match = html.match(/window\.state\s*=\s*(\{.+?\})<\/script>/s)?.[1]
      const state: State = match ? JSON.parse(match) : { content: [], data: {} }
      state.page = { ...state.page, title: html.match(/<title>(.*?)<\/title>/)?.[1] }
      cache.set(path, state)
    }
    const promise = run()
    inflight.set(path, promise)
    void promise.finally(() => inflight.delete(path))
    return promise
  }

  const openPage = async (path: string): Promise<void> => {
    await fetchPage(path)
    const state = cache.get(path)
    if (!state) return

    // Missing block code must arrive before the content swap, or the new
    // page's unknown blocks would render as nothing.
    if (options.ensureBlocks) await options.ensureBlocks(state.content ?? [])

    for (const [key, value] of Object.entries(state.data ?? {})) {
      const target = (data[key] ??= {}) as Record<string, unknown>
      for (const existingKey of Object.keys(target)) {
        if (!(existingKey in (value as object))) delete target[existingKey]
      }
      Object.assign(target, value)
    }

    options.applyState?.(state)
    content.value = state.content
    currentRoute.path = path

    if (options.mode === 'dev' && typeof document !== 'undefined') {
      const event = new Event('mechanica:navigate')
      Object.assign(event, { detail: { path, content: content.value, data } })
      document.dispatchEvent(event)
    }
  }

  /**
   * Where a completed navigation lands. A real browser jumps to the top of a
   * new document, or to the `#id` element when the URL carries a fragment —
   * SPA navigation has to do both by hand.
   *
   * `'instant'` is deliberate: a site-wide `scroll-behavior: smooth` would
   * otherwise animate the jump *after* the new content is already swapped in.
   */
  const settleScroll = async (hash: string, swapped: boolean): Promise<void> => {
    if (!isBrowser) return
    // The content swap renders on the next tick — the anchor doesn't exist yet.
    await nextTick()

    if (hash) {
      const el = document.getElementById(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' })
        return
      }
      // A dead anchor on the page we're already on leaves the view alone, the
      // way the browser does; on a fresh page we still land at the top.
      if (!swapped) return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }

  const push = async (path: string): Promise<void> => {
    const target = normalizePath(path)
    const { path: bare, hash } = splitHash(target)
    if (isBrowser) window.history.pushState({}, '', target)
    // A bare `#faq`, or a fragment on the page we're already on, is an in-page
    // jump: no fetch, no content swap.
    const swapped = Boolean(bare) && bare !== currentRoute.path
    if (swapped) await openPage(bare)
    await settleScroll(hash, swapped)
  }

  if (isBrowser) {
    window.addEventListener('popstate', () => {
      const target = normalizePath(stripBase(window.location.pathname))
      const hash = window.location.hash.slice(1)
      void (async () => {
        const swapped = target !== currentRoute.path
        if (swapped) await openPage(target)
        // Only a fragment is honored here — for a plain back/forward the
        // browser restores the position it recorded for that history entry.
        if (hash) await settleScroll(hash, false)
      })()
    })
  }

  return { currentRoute, push, normalizePath }
}

/** Access the router inside a component. */
export function useRouter(): MechanicaRouter {
  return requireContext().router
}

/** Access the reactive current route inside a component. */
export function useRoute(): { path: string } {
  return requireContext().router.currentRoute
}

function requireContext() {
  const ctx = inject(mechanicaKey)
  if (!ctx) throw new Error('[mechanica] router used outside a Mechanica app')
  return ctx
}
