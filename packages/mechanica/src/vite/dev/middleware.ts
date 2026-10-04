import type { Connect } from 'vite'
import { createEditorService, type EditorServiceOptions } from '../../server/service'
import { toNodeMiddleware } from '../../server/node-adapter'

export type { BlockListing } from '../../server/service'
export type DevMiddlewareOptions = EditorServiceOptions

/**
 * The `/@mechanica` dev middleware: the site's editor API (`src/server` —
 * page CRUD, asset upload/serve, folder list, query resolution) over the local
 * `.mech` store, mounted on Vite's connect stack. Mounted under the
 * `/@mechanica` prefix, so `req.url` here is already prefix-stripped.
 */
export function createDevMiddleware(
  mechDir: string,
  options: DevMiddlewareOptions = {},
): Connect.NextHandleFunction {
  return toNodeMiddleware(createEditorService(mechDir, options)) as Connect.NextHandleFunction
}
