/**
 * Resolve which built files a page needs for its blocks, from the client
 * build's Vite manifest (`dist/.vite/manifest.json`) plus the plugin-emitted
 * block map (`dist/mechanica-blocks.json`, block id → source file).
 *
 * Blocks are code-split out of the client entry, so without help the browser
 * would discover a page's block chunks only after the entry runs (a round
 * trip) and their CSS only at hydrate time (a flash of unstyled blocks). The
 * export injects `<link rel="stylesheet">` + `<link rel="modulepreload">` per
 * page instead, computed here.
 */

/**
 * Where the plugin writes the block map in the client build's outDir
 * (`generateBundle` in `src/vite/plugin.ts`).
 */
export const BLOCKS_MANIFEST_FILE = 'mechanica-blocks.json'

/** One entry of Vite's build manifest (the fields this module reads). */
export interface ManifestChunk {
  file: string
  css?: string[]
  imports?: string[]
}

export type ViteManifest = Record<string, ManifestChunk>

export interface PageAssets {
  /** JS chunk files (the block chunks and their static imports). */
  js: string[]
  /** CSS files those chunks bring in. */
  css: string[]
}

/**
 * Collect a manifest entry's chunk, its CSS, and everything its static
 * imports pull in (transitively) — the full set the browser will fetch when
 * that module is imported.
 */
export function resolveChunkAssets(
  manifest: ViteManifest,
  key: string,
  into: PageAssets = { js: [], css: [] },
  seen: Set<string> = new Set(),
): PageAssets {
  if (seen.has(key)) return into
  seen.add(key)

  const chunk = manifest[key]
  if (!chunk) return into

  if (!into.js.includes(chunk.file)) into.js.push(chunk.file)
  for (const css of chunk.css ?? []) {
    if (!into.css.includes(css)) into.css.push(css)
  }
  for (const imported of chunk.imports ?? []) {
    resolveChunkAssets(manifest, imported, into, seen)
  }
  return into
}

export interface BlockAssetLinkOptions {
  /** Block ids used by the page's content tree. */
  blockIds: Iterable<string>
  manifest: ViteManifest
  /** Block id → root-relative source file (manifest key), from the plugin. */
  blockFiles: Record<string, string>
  /**
   * Skip files the HTML already references — the entry's own chunks and CSS
   * are linked by the built index template, so re-preloading them is noise.
   */
  alreadyLinked?: (file: string) => boolean
}

/**
 * Build the `<link>` tags for one page: stylesheets first (they must apply
 * before first paint — the server-rendered blocks are already in the HTML),
 * then `modulepreload` for the block chunks and their shared imports.
 */
export function blockAssetLinks(options: BlockAssetLinkOptions): string[] {
  const assets: PageAssets = { js: [], css: [] }
  const seen = new Set<string>()
  for (const blockId of options.blockIds) {
    const key = options.blockFiles[blockId]
    if (key) resolveChunkAssets(options.manifest, key, assets, seen)
  }

  const wanted = (file: string): boolean => !options.alreadyLinked?.(file)
  return [
    ...assets.css.filter(wanted).map((file) => `<link rel="stylesheet" href="/${file}">`),
    ...assets.js.filter(wanted).map((file) => `<link rel="modulepreload" href="/${file}">`),
  ]
}
