import { runBuild } from './build'
import { exportBuilt, type ExportOptions } from './export'

/**
 * `mechanica export`: build the project, then statically render every page
 * into `export/`. Kept apart from `export.ts` so that module never imports
 * Vite — `mechanica/export` runs where only a built bundle exists.
 */
export async function runExport(options: ExportOptions = {}): Promise<void> {
  await runBuild()
  const { pages } = await exportBuilt(process.cwd(), options)

  for (const path of pages) console.info('Generated', path)
  console.info(`Exported ${pages.length} page(s) → ${options.outDir ?? 'export'}/`)
}
