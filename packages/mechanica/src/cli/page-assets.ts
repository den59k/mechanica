/**
 * Resolve which built files a page needs for its blocks, from the client
 * build's Vite manifest (`dist/.vite/manifest.json`) plus the plugin-emitted
 * block map (`dist/mechanica-blocks.json`, block id → source file + the
 * output chunk that contains it).
 *
 * Blocks are code-split out of the client entry, so without help the browser
 * would discover a page's block chunks only after the entry runs (a round
 * trip) and their CSS only at hydrate time (a flash of unstyled blocks). The
 * export injects `<link rel="stylesheet">` + `<link rel="modulepreload">` per
 * page instead, computed here.
 *
 * Blocks are located in the manifest by their chunk **file** (not a source
 * key): with `blockChunks: 'bundled'` many blocks share one chunk, which has
 * no per-block manifest entries — the chunk file is the stable join point.
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

/** One entry of the plugin-emitted block map (`mechanica-blocks.json`). */
export interface BlockChunkRef {
  /** Root-relative source file (for humans and debugging). */
  src: string
  /** The built chunk containing the block, as the manifest's `file` field. */
  chunk: string
}

export interface BlockAssetLinkOptions {
  /** Block ids used by the page's content tree. */
  blockIds: Iterable<string>
  manifest: ViteManifest
  /** Block id → source + containing chunk, from the plugin. */
  blockFiles: Record<string, BlockChunkRef>
  /**
   * Skip files the HTML already references — the entry's own chunks and CSS
   * are linked by the built index template, so re-preloading them is noise.
   */
  alreadyLinked?: (file: string) => boolean
  /**
   * CDN origin (trailing slash trimmed) prepended to each href, so the injected
   * preload links point at the CDN like the rest of the build assets. Empty /
   * omitted keeps them root-relative (`/assets/…`). Must match Vite's `base` so
   * the preload and the actual chunk import resolve to the same URL.
   */
  base?: string
}

/**
 * Build the `<link>` tags for one page: stylesheets first (they must apply
 * before first paint — the server-rendered blocks are already in the HTML),
 * then `modulepreload` for the block chunks and their shared imports.
 *
 * Every tag carries `crossorigin`, like the ones Vite writes into the built
 * index: a later `import()` of the same chunk always fetches in CORS mode, and
 * on a cross-origin CDN a copy cached by a no-CORS hint has no
 * `Access-Control-Allow-Origin`, so the browser would block the import. The
 * attribute is a no-op for same-origin builds.
 */
export function blockAssetLinks(options: BlockAssetLinkOptions): string[] {
  // Manifest entries are keyed by source module (or `_<file>` for shared
  // chunks); join by the emitted chunk file instead, which we know exactly.
  const keyByFile = new Map<string, string>()
  for (const [key, entry] of Object.entries(options.manifest)) {
    keyByFile.set(entry.file, key)
  }

  const assets: PageAssets = { js: [], css: [] }
  const seen = new Set<string>()
  for (const blockId of options.blockIds) {
    const ref = options.blockFiles[blockId]
    const key = ref && keyByFile.get(ref.chunk)
    if (key) resolveChunkAssets(options.manifest, key, assets, seen)
  }

  const wanted = (file: string): boolean => !options.alreadyLinked?.(file)
  const href = (file: string): string => `${options.base ?? ''}/${file}`
  return [
    ...assets.css.filter(wanted).map((file) => `<link rel="stylesheet" crossorigin href="${href(file)}">`),
    ...assets.js.filter(wanted).map((file) => `<link rel="modulepreload" crossorigin href="${href(file)}">`),
  ]
}
