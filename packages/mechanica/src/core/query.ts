import { inject, onServerPrefetch, reactive } from 'vue'
import { mechanicaKey } from './state'

function assignInto(target: any, source: unknown): void {
  if (Array.isArray(target)) {
    target.length = 0
    if (Array.isArray(source)) target.push(...source)
  } else if (source && typeof source === 'object') {
    Object.assign(target, source)
  }
}

/**
 * Resolve a query by key for the current mode and return a reactive container
 * that fills in when the data is available:
 * - **server**: awaited during SSR via `onServerPrefetch` using `resolveQuery`
 * - **dev**: fetched asynchronously via `resolveQuery` (the dev server)
 * - **client**: read synchronously from the serialized `queryData`
 */
export function runQuery<T extends object>(key: string, initial: T): T {
  const ctx = inject(mechanicaKey)
  if (!ctx) throw new Error('[mechanica] query composable used outside a Mechanica app')

  const value = reactive(initial) as T

  if (ctx.mode === 'server') {
    if (ctx.resolveQuery) {
      onServerPrefetch(async () => assignInto(value, await ctx.resolveQuery!(key)))
    }
  } else if (ctx.mode === 'dev') {
    if (ctx.resolveQuery) {
      void Promise.resolve(ctx.resolveQuery(key)).then((result) => assignInto(value, result))
    }
  } else {
    assignInto(value, ctx.queryData[key])
  }

  return value
}
