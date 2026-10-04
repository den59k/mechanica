import { join } from 'node:path'
import { fsAssetStore, withRemoteAssets, type AssetStore } from '../server/assets-store'
import { runBuild } from './build'
import { exportBuilt, type ExportOptions } from './export'
import { remoteAssetsFor, uploadsIgnored } from './platform/assets'

/**
 * The uploads a local export reads: the project's `.mech/assets`, and — for a
 * project linked to a hosted platform — the uploads kept there, fetched as the
 * pages turn out to need them (and kept in `.mech/assets` when git ignores it).
 * Only local files are *listed*: the uploads the platform holds that no page
 * here refers to are not this export's to warn about.
 */
export function exportAssets(cwd: string): AssetStore {
  const local = fsAssetStore(join(cwd, '.mech'))
  const remote = withRemoteAssets(local, remoteAssetsFor(cwd), { cache: () => uploadsIgnored(cwd) })
  return { ...remote, list: () => local.list() }
}

/**
 * `mechanica export`: build the project, then statically render every page
 * into `export/`. Kept apart from `export.ts` so that module never imports
 * Vite — `mechanica/export` runs where only a built bundle exists.
 */
export async function runExport(options: ExportOptions = {}): Promise<void> {
  await runBuild()
  const cwd = process.cwd()
  const { pages } = await exportBuilt(cwd, { assets: exportAssets(cwd), ...options })

  for (const path of pages) console.info('Generated', path)
  console.info(`Exported ${pages.length} page(s) → ${options.outDir ?? 'export'}/`)
}
