import type { Block } from 'vuewrite'

/**
 * A rich-text widget: a vuewrite custom block that flows inside prose (image,
 * code, callout, …). Widgets are inserted from the slash menu / toolbar and
 * rendered by the editor's and viewer's slots. Their on-disk form is whatever
 * `vuewrite/markdown` already emits for the block (e.g. `<img src/>`, ``` fences),
 * so storage is free — this registry only drives the *editing* surface.
 *
 * Widgets are deliberately a small, curated set kept OUT of the block palette:
 * leaves that belong in prose, not page-structure blocks.
 */
export interface RichTextWidget {
  /** vuewrite block `type` (and the slot name used to render it). */
  type: string
  /** Slash-menu / toolbar label. */
  title: string
  /** VIcon name. */
  icon: string
  /** Extra terms to match in the slash menu. */
  keywords?: string[]
  /** A fresh block to insert. */
  create(): Partial<Block>
}

export const richTextWidgets: RichTextWidget[] = [
  {
    type: 'img',
    title: 'Image',
    icon: 'image',
    keywords: ['image', 'picture', 'photo', 'upload'],
    create: () => ({ type: 'img', editable: false, src: '' }),
  },
  {
    type: 'code',
    title: 'Code',
    icon: 'code',
    keywords: ['code', 'snippet', 'pre'],
    // editable:false → the #code slot owns its own textarea (not vuewrite text).
    create: () => ({ type: 'code', editable: false, text: '', lang: '' }),
  },
  {
    type: 'callout',
    title: 'Callout',
    icon: 'info',
    keywords: ['callout', 'note', 'admonition', 'tip', 'warning'],
    // Editable rich text (vuewrite-managed) styled by tone via the renderer.
    create: () => ({ type: 'callout', tone: 'info', text: '' }),
  },
]
