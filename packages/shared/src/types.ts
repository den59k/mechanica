/**
 * Core data types shared between the plugin runtime, the editor, and the
 * (future) render service. This module is intentionally DOM- and
 * framework-free so the render side can import it cleanly.
 */

import type { LocalesConfig } from './locale'

/** Scope at which a {@link DataEntry} lives. */
export type DataScope = 'site' | 'folder' | 'page'

/** Metadata about the current page, exposed via `usePageData`. */
export interface PageMeta {
  title?: string
  path?: string
  meta?: Record<string, unknown>
  /**
   * The page's layout — a key into the app's `layouts` map (`defineMechanicaApp`).
   * Authored as top-level `layout:` frontmatter in the `.page.md`. Absent = the
   * default layout (the map's first entry). Base-owned on multi-language sites:
   * translations always inherit it.
   */
  layout?: string
  /**
   * Set on paginated variants of a page (`/blog/2`, …): which chunk of its
   * paginated query this URL shows. Page 1 is the base path and carries none.
   */
  pagination?: { page: number; pageCount?: number }
  /** The locale this page renders in (multi-language sites). Omitted when i18n is off. */
  locale?: string
  /** Which locales this logical page has a translation for (the default included). */
  locales?: string[]
  /**
   * True when the requested locale has no translation file and the page is
   * rendering the default-locale content as a fallback (dev only — the editor
   * shows a "translate this page" banner). Never set at export.
   */
  localeFallback?: boolean
}

/**
 * Editor-facing metadata describing a *block type* — its schema and palette
 * presentation, not its placed content. Produced by the block compiler from a
 * `defineBlock(...)` descriptor.
 */
export interface Block {
  id: string
  name: string
  /** Palette grouping (was `group` in v1). */
  category?: string
  /** Icon key shown in the block palette. */
  icon?: string
  description?: string
  /** Sort order within a category. */
  order?: number
  /** Hidden from the palette. */
  hidden?: boolean
  /** Available only in dev, stripped from production output. */
  devOnly?: boolean
  /**
   * A block that *is* a whole page (a feedback form, a 404, a legal page).
   * Offered under a "Pages" palette group only while the page is still empty,
   * and never on a page that already has content — so page-shaped blocks stop
   * polluting the palette everywhere else. Placed blocks always keep rendering.
   */
  standalone?: boolean
  /**
   * Restrict the block to pages using these layouts (keys of the app's
   * `layouts` map). Omitted = offered on every layout. Like `folders`, this
   * only filters the palette — placed blocks always render.
   */
  layouts?: string[]
  /**
   * Restrict the block to pages under these folders (folder paths relative to
   * `pages/`, e.g. `'docs'`; nested folders match by prefix). Omitted = offered
   * everywhere. Placed blocks always keep rendering — this only filters what
   * the palette offers.
   */
  folders?: string[]
  /**
   * Schema version of this block (defaults to 1). Bump it together with a
   * `migrate` function whenever a saved page's data needs reshaping (renamed
   * prop, changed type); placed blocks record the version they were written
   * with and migrate on load.
   */
  version?: number
  /**
   * Upgrade a placed block's data from an older schema version. Receives the
   * stored data and the version it was written with; mutate it in place or
   * return the replacement. Must handle every `from < version`.
   */
  migrate?: (data: Record<string, unknown>, from: number) => Record<string, unknown> | undefined | void
  /**
   * Example prop values used when the block renders outside a page — the
   * palette hover preview and the `/@mechanica/preview` route (`mechanica shot`).
   * Merged over schema defaults, so it only needs the props that matter visually.
   * A `$slots` key fills the block's slots with child blocks (see
   * `PreviewSlotEntry` in `mechanica`); unfilled slots preview as placeholders.
   */
  previewData?: Record<string, unknown>
  /** compact-json-schema describing the editable props. */
  props?: Record<string, unknown>
  /** Slot name → slot metadata (currently `true`). */
  slots?: Record<string, unknown>
  /**
   * Marks a block produced by the Block Composer (a {@link ComposedBlockDefinition}),
   * rather than a compiled SFC. The page editor uses it to offer Edit/Delete and
   * to group these under "Site blocks". Set by the composed-block factory.
   */
  composed?: boolean
}

/**
 * One entry in the Block Composer's components manifest (`src/composer.ts`,
 * declared with `defineComposerComponents`). It exposes a site's own design
 * system — a plain Vue SFC plus the compact-json-schema for its editable props —
 * as building material in the composer, without touching the block compiler.
 *
 * DOM-free here: `component` is typed `unknown`; the `mechanica` package narrows
 * it to a Vue `Component`. A manifest value may also be a bare string, which
 * re-exposes an existing compiled block (by id) in the composer palette.
 */
export interface ComposerComponentDefinition {
  /** The Vue component rendered for this id (narrowed to `Component` in `mechanica`). */
  component?: unknown
  /** Display name in the composer's Components palette. */
  name: string
  /** VIcon name (or raw `<svg>`) for the palette card. */
  icon?: string
  /** compact-json-schema describing the editable props (same field registry as blocks). */
  props?: Record<string, unknown>
  /** Example prop values for the canvas / previews. */
  previewData?: Record<string, unknown>
}

/** A components-manifest entry: a definition, or a string id re-exposing a compiled block. */
export type ComposerComponentEntry = ComposerComponentDefinition | string

/** The built-in composer element kinds a design-system class can attach to. */
export type ComposerElementKind = 'frame' | 'text' | 'image'

/**
 * One design-system CSS class the site offers to the Block Composer (via
 * `defineComposer`'s `classes`). The manifest key IS the CSS class name — the
 * developer writes `.container` in their stylesheet, declares it here, and the
 * composer offers it as a **Style** on matching elements. See COMPOSER-MANIFEST.md.
 */
export interface ComposerClassDefinition {
  /** Label shown in the Style select; defaults to the class name. */
  title?: string
  /** Which element kinds may pick this class. */
  on: ComposerElementKind | ComposerElementKind[]
  /**
   * Optional group. Classes sharing a group are mutually exclusive (one Style
   * select per group, single-pick); classes in different groups stack on the
   * element. Ungrouped classes share one implicit default group labelled "Style".
   * The developer guarantees groups are orthogonal, so precedence stays clear.
   */
  group?: string
}

/**
 * A `classes` entry: the full definition, or a shorthand — a bare kind (`'text'`)
 * or an array of kinds (`['frame', 'image']`), with the title defaulting to the
 * class name.
 */
export type ComposerClassEntry = ComposerClassDefinition | ComposerElementKind | ComposerElementKind[]

/** A class entry normalized for the composer (shorthands unfolded). */
export interface ComposerClassDef {
  /** The CSS class name (the manifest key). */
  cls: string
  /** Label for the Style select. */
  title: string
  /** Element kinds that may pick it. */
  kinds: ComposerElementKind[]
  /** Group key (undefined = the default "Style" group). Same group = mutually exclusive. */
  group?: string
}

/**
 * The site's element-system breakpoints (max-widths in px). Two fixed tiers;
 * only the widths are configurable. Consumed by the generated element CSS and
 * the composer's device switcher. Defaults: `{ md: 1024, sm: 640 }`.
 */
export interface ComposerBreakpoints {
  md: number
  sm: number
}

/**
 * The Block Composer manifest (`src/composer.ts`, declared with `defineComposer`).
 * A single home for the site's design system as seen by the composer: its
 * components, its CSS classes, and its breakpoints. All sections are optional —
 * a site that declares only `components` behaves exactly as before the split.
 */
export interface ComposerManifest {
  /** The site's design-system components (was `defineComposerComponents`). */
  components?: Record<string, ComposerComponentEntry>
  /** Design-system CSS classes offered as element **Style** in the composer. */
  classes?: Record<string, ComposerClassEntry>
  /** Element-system breakpoints (max-widths, px). Numeric literals only. */
  breakpoints?: Partial<ComposerBreakpoints>
}

/**
 * A designer-assembled block ("composed block"): a named, parameterized
 * {@link ContentBlock} subtree saved as data. It is not compiled — at render
 * time it *expands* into its template through the normal block-render pipeline,
 * so it behaves like any other block (palette, settings form, export, shots).
 *
 * Authored in the Block Composer and persisted as `.mech/blocks/<id>.block.yml`
 * (codec in `mechanica-shared/block-format`); a developer can hand-write the
 * same file. See PLAN.md.
 */
export interface ComposedBlockDefinition {
  /** Stable, kebab-case id; unique across compiled blocks and composed blocks. */
  id: string
  /** Display name shown in the palette. */
  name: string
  /** VIcon name shown on the palette card. */
  icon?: string
  /** Palette grouping; defaults to a "Site blocks" group in the editor. */
  category?: string
  /**
   * Hidden from the palette (like `Block.hidden`). Set on one-off blocks —
   * e.g. a block created to design a single page in the composer — so they
   * don't appear under "Site blocks" on every other page. Placed instances
   * keep rendering; untick in the composer settings to promote it to reusable.
   */
  hidden?: boolean
  /**
   * A whole-page block (like `Block.standalone`): offered in the empty page's
   * "Start this page" palette group and the Page setup pane's Page-block
   * select, never alongside content blocks. Toggled in the composer settings —
   * a designer-built 404 or coming-soon page.
   */
  standalone?: boolean
  /**
   * compact-json-schema for the props exposed out of the template (§ prop
   * bindings). Placed instances get an auto-generated settings form from this,
   * exactly like a compiled block's `props`.
   */
  props?: Record<string, unknown>
  /**
   * Example prop values for previews (palette hover, `/@mechanica/preview`,
   * `mechanica shot`). Captured from the canvas values at author time.
   */
  previewData?: Record<string, unknown>
  /**
   * The block body: element/block nodes. A value inside a node's `data` may be
   * a {@link PropBinding} (`{ $bind: 'propName' }`) that resolves from the
   * instance's props at render time (see `resolveComposedTemplate`).
   */
  template: ContentBlock[]
}

/**
 * A placeholder inside a composed template's data, replaced at render time by
 * the value of the named prop on the placed instance.
 */
export interface PropBinding {
  $bind: string
}

/** A block placed in a page's content tree. */
export interface ContentBlock {
  id: string
  blockId: string
  data: Record<string, unknown>
  /** Schema version the data was written with (absent = 1); see `Block.version`. */
  v?: number
  /** Either a single default-slot list or a map of named-slot lists. */
  children?: ContentBlock[] | Record<string, ContentBlock[]>
}

/** A shared data entry declared with `defineData`. */
export interface DataEntry {
  id: string
  title?: string
  /** compact-json-schema describing the data shape. */
  props?: Record<string, unknown>
  /**
   * Translate this entry per locale (multi-language sites). Its site/folder
   * value is stored per locale (with fallback to the default locale) instead of
   * once, so shared strings (nav labels, footer) can differ by language. Ignored
   * when i18n is off. Page-scoped values are already per-locale (they live in
   * the translation file), so this only affects site/folder scope.
   */
  localized?: boolean
}

/**
 * The runtime state serialized onto the page (`window.state`) and read back by
 * the runtime to hydrate.
 */
export interface State {
  content: ContentBlock[]
  /** Effective data: site < folder < page merged, with schema defaults filled. */
  data: Record<string, unknown>
  query?: Record<string, unknown>
  /**
   * Scope buckets for the editor, so it can edit each level and tell which
   * entries a page overrides. Only injected in dev (the runtime renders `data`).
   */
  siteData?: Record<string, unknown>
  folderData?: Record<string, unknown>
  pageData?: Record<string, unknown>
  /** The folder this page lives in (null at the root), so the editor can offer folder scope. */
  folder?: string | null
  /**
   * The default-locale page's content (dev only, on a non-default locale). Lets
   * the editor mark which fields a translation *overrides* vs inherits, and
   * offer a one-click reset to the inherited value. Absent when i18n is off or
   * on the default locale.
   */
  baseContent?: ContentBlock[]
  /** Base URL the page is served under (for routing/link resolution). */
  baseUrl?: string
  /** Current page metadata. */
  page?: PageMeta
  /**
   * The site's locale configuration (multi-language sites). Present in the
   * serialized state so the runtime can prefix internal links for the current
   * locale and build language switchers. Absent when i18n is off.
   */
  locales?: LocalesConfig
  /**
   * Dev only: this state belongs to a programmatically generated page
   * ({@link VirtualPage}) that has no `.page.md` file. The editor treats it as
   * read-only — it never queues a save against a nonexistent file.
   */
  generated?: boolean
}

/**
 * A page produced programmatically (the plugin's `generatePages` option) instead
 * of from a `.page.md` file — plain, serializable data. The plugin runs its
 * providers at build and bakes the output into the SSR bundle for the static
 * export; the same shape is what a future render backend consumes for on-demand
 * / webhook regeneration. One `VirtualPage` per (logical page × locale).
 */
export interface VirtualPage {
  /** Logical (unprefixed) path, e.g. `/docs/api/math/mathf`. Localized per `locale` when served. */
  path: string
  /** The block tree to render — usually one template block parameterized by `data`. */
  content: ContentBlock[]
  /** Page-scoped data (head, block props). Site data still merges under it. */
  data?: Record<string, unknown>
  /** Page meta: `title` (breadcrumb / SEO name), `noindex`, and `{{ page.meta.* }}` hints. */
  meta?: Record<string, unknown>
  /** The page's layout (key into the app's `layouts` map); absent = default. */
  layout?: string
  /** The locale this page renders in. Omit for the default locale. */
  locale?: string
  /** Every locale this logical page exists in — for hreflang alternates + language switchers. */
  locales?: string[]
  /** Sitemap `<lastmod>` (ISO date). The provider supplies it; there is no file to stat. */
  lastmod?: string
}

/** A link target produced by the `smartLink` field type. */
export interface PageLink {
  id: string
  url?: string
  query?: string
  title: string
  external?: boolean
  openNewTab?: boolean
}
