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
