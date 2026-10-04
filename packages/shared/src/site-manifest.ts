import type { Block, VirtualPage } from './types'
import type { LocalesConfig } from './locale'

/** The file `mechanica build` writes the manifest to, inside `dist/`. */
export const SITE_MANIFEST_FILE = 'mechanica-site.json'

/**
 * What a site's **code** offers, as plain data: everything the editor API
 * (`mechanica/server`) needs to know about the code in order to serve the
 * site's content — without running any of it.
 *
 * In dev the Vite plugin builds it from the live modules; `mechanica build`
 * writes it to `dist/mechanica-site.json`, so a host that only has the built
 * bundle (and must not execute it) can still read pages with the right
 * rich-text conversion, schema defaults and image metadata.
 *
 * Being JSON, it carries no functions: a block's `migrate` is absent from a
 * manifest read back from disk, so page-read schema migrations only run where
 * the manifest was built in memory (dev).
 */
export interface SiteManifest {
  format: 1
  /** The `mechanica` version that produced it. */
  engine?: string
  /** Every block the site has — compiled and composed — with unfolded prop schemas. */
  blocks: Block[]
  /** The site's locale config; null when it is single-language. */
  locales: LocalesConfig | null
  /** Programmatically generated pages (plugin `generatePages`), baked as data. */
  generated: VirtualPage[]
}
