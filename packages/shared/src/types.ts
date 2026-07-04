/**
 * Core data types shared between the plugin runtime, the editor, and the
 * (future) render service. This module is intentionally DOM- and
 * framework-free so the render side can import it cleanly.
 */

/** Scope at which a {@link DataEntry} lives. */
export type DataScope = 'site' | 'folder' | 'page'

/** Metadata about the current page, exposed via `usePageData`. */
export interface PageMeta {
  title?: string
  path?: string
  meta?: Record<string, unknown>
  /**
   * Set on paginated variants of a page (`/blog/2`, …): which chunk of its
   * paginated query this URL shows. Page 1 is the base path and carries none.
   */
  pagination?: { page: number; pageCount?: number }
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
  /** Base URL the page is served under (for routing/link resolution). */
  baseUrl?: string
  /** Current page metadata. */
  page?: PageMeta
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
