/**
 * `mechanica/server` — the editor API of a site, free of Vite: what the dev
 * server mounts under `/@mechanica`, and what a self-hosted or hosted editing
 * service mounts over a site's working copy. Like `mechanica/export`, nothing
 * reachable from here may import Vite.
 */
export {
  createEditorService,
  type EditorService,
  type EditorServiceOptions,
  type BlockListing,
} from './service'
export { toNodeMiddleware, type NodeMiddleware } from './node-adapter'
export { buildSiteManifest, readSiteManifest, configureSite, type SiteManifestInput } from './site'
export { SITE_MANIFEST_FILE, type SiteManifest } from 'mechanica-shared'
