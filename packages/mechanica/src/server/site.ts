import fs from 'node:fs'
import { join } from 'node:path'
import {
  SITE_MANIFEST_FILE,
  areFieldSchemasRegistered,
  registerFieldSchemas,
  type ComposedBlockDefinition,
  type LocalesConfig,
  type SiteManifest,
  type VirtualPage,
} from 'mechanica-shared'
import { toBlockMeta, composedBlockMeta, type BlockComponent } from '../editor/lib/block-meta'
import { setPageBlocks, setPageCodec } from './pages-store'
import type { Mech } from './content-files'
import { richTextCodecFromBlocks } from './rich-text-codec'
import { generatedServedPath } from '../vite/generate-pages'

export interface SiteManifestInput {
  /** The compiled block components (`blocksList` of the blocks / SSR module). */
  components: Iterable<BlockComponent>
  /** The site's composed-block definitions. */
  composed?: ComposedBlockDefinition[]
  site?: SiteManifest['site']
  locales?: LocalesConfig | null
  generated?: VirtualPage[]
  engine?: string
}

/** Describe a site's code as data — see {@link SiteManifest}. */
export function buildSiteManifest(input: SiteManifestInput): SiteManifest {
  // Unfolding a block's props needs the field-format aliases (`'image'`, …).
  if (!areFieldSchemasRegistered()) registerFieldSchemas()
  return {
    format: 1,
    ...(input.engine ? { engine: input.engine } : {}),
    blocks: [...[...input.components].map(toBlockMeta), ...(input.composed ?? []).map(composedBlockMeta)],
    ...(input.site?.url || input.site?.name ? { site: input.site } : {}),
    locales: input.locales ?? null,
    generated: input.generated ?? [],
  }
}

/** Read the manifest a build left in `distDir`, or null when there is none. */
export function readSiteManifest(distDir: string): SiteManifest | null {
  const file = join(distDir, SITE_MANIFEST_FILE)
  if (!fs.existsSync(file)) return null
  const manifest = JSON.parse(fs.readFileSync(file, 'utf-8')) as SiteManifest
  if (manifest.format !== 1) throw new Error(`Unsupported site manifest format: ${String(manifest.format)}`)
  return manifest
}

/**
 * Tell the stores what the code behind a `.mech` directory looks like: the
 * rich-text codec and the block metadata every page read and write of that
 * site goes through. Keyed by directory, so one process can serve many sites.
 */
export function configureSite(mech: Mech, manifest: SiteManifest): void {
  if (!areFieldSchemasRegistered()) registerFieldSchemas()
  // A host that assembles a site's files per request configures them per
  // request — the codec is derived from the manifest once, not every time.
  let codec = codecs.get(manifest)
  if (!codec) codecs.set(manifest, (codec = { value: richTextCodecFromBlocks(manifest.blocks) }))
  setPageCodec(mech, codec.value)
  setPageBlocks(mech, manifest.blocks)
}

const codecs = new WeakMap<SiteManifest, { value: ReturnType<typeof richTextCodecFromBlocks> }>()

/** Generated pages indexed for the service: by served URL, plus their logical paths. */
export interface GeneratedIndex {
  pages: VirtualPage[]
  byServed: Map<string, VirtualPage>
  logical: Set<string>
}

export function indexGeneratedPages(manifest: SiteManifest): GeneratedIndex {
  const byServed = new Map<string, VirtualPage>()
  const logical = new Set<string>()
  for (const page of manifest.generated) {
    byServed.set(generatedServedPath(page, manifest.locales), page)
    logical.add(page.path)
  }
  return { pages: manifest.generated, byServed, logical }
}
