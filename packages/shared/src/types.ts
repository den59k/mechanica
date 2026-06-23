/**
 * Core data types shared between the plugin runtime, the editor, and the
 * (future) render service. This module is intentionally DOM- and
 * framework-free so the render side can import it cleanly.
 */

/** Scope at which a {@link DataEntry} lives. */
export type DataScope = 'site' | 'folder' | 'page'

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
  /** Either a single default-slot list or a map of named-slot lists. */
  children?: ContentBlock[] | Record<string, ContentBlock[]>
}

/** A shared data entry declared with `defineData`. */
export interface DataEntry {
  id: string
  title?: string
  scope?: DataScope
  /** compact-json-schema describing the data shape. */
  props?: Record<string, unknown>
}

/**
 * The runtime state serialized onto the page (`window.state`) and read back by
 * the runtime to hydrate.
 */
export interface State {
  content: ContentBlock[]
  data: Record<string, unknown>
  query?: Record<string, unknown>
  /** Per-data-entry scope, used by the editor to split data on save. */
  dataScopes?: Record<string, DataScope>
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
