import type { SchemaItem, SchemaType } from 'compact-json-schema'

declare global {
  /** Descriptor passed to the {@link defineBlock} macro. */
  interface BlockDefinition<T extends SchemaItem> {
    /** Stable block id. Defaults to the kebab-cased filename. */
    id?: string
    /** Display name shown in the editor palette. */
    name?: string
    /** Palette grouping. */
    category?: string
    /** Icon key shown in the palette. */
    icon?: string
    description?: string
    /** Sort order within a category. */
    order?: number
    /** Hide from the palette. */
    hidden?: boolean
    /** Available only in dev; stripped from production output. */
    devOnly?: boolean
    /**
     * Output chunk group for the production client build. Blocks sharing a
     * name are emitted as one `blocks-<name>` chunk; unmarked blocks follow
     * the plugin's `blockChunks` setting (one shared `blocks` chunk by
     * default). Mark heavy, rarely-used blocks (charts, maps) so only the
     * pages using them pay for their code. Must be a string literal.
     */
    chunk?: string
    /** Editable props (compact-json-schema). */
    props?: T
    /** Slot names; auto-detected from `<slot>` when omitted. */
    slots?: string[] | Record<string, unknown>
    /**
     * Example prop values for previews (palette hover, `/@mechanica/preview`,
     * `mechanica shot`), merged over schema defaults. A `$slots` key fills the
     * block's slots with child blocks:
     * `{ $slots: { default: [{ blockId: 'card', data: {…} }] } }` —
     * slots without authored content preview as labelled placeholder boxes.
     */
    previewData?: Record<string, unknown>
  }

  /**
   * Compile-time macro (no import) used inside a block's `<script setup>`.
   * Declares the block's editable props and metadata and returns the typed
   * props object. The Mechanica Vite plugin transforms it away at build time.
   */
  function defineBlock<T extends SchemaItem = {}>(definition: BlockDefinition<T>): SchemaType<T>
}

export {}
