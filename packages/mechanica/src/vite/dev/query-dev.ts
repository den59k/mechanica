import { listPages } from './pages-store'

/**
 * Resolve a dev-mode query key against the local `.mech` store. Keys are of the
 * form `"<type>.<json-args>"` (the same encoding the runtime composables use).
 */
export function resolveDevQuery(mechDir: string, key: string): unknown {
  const dot = key.indexOf('.')
  const type = key.slice(0, dot)
  const args = JSON.parse(key.slice(dot + 1) || '{}') as {
    folderName?: string
    data?: { id: string }[]
  }

  if (type === 'getPages') {
    let pages = listPages(mechDir, args)
    if (args.folderName) pages = pages.filter((page) => page.folderPath === args.folderName)
    // Strip internal ordering fields from the public result.
    return pages.map(({ order, orderAfter, folderPath, ...rest }) => rest)
  }

  return {}
}
