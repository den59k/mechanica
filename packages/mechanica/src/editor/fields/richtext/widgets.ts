import type { Component } from 'vue'
import type { Block } from 'vuewrite'
import RichImageWidget from './RichImageWidget.vue'
import RichCodeWidget from './RichCodeWidget.vue'

/**
 * A rich-text widget: a vuewrite custom block that flows inside prose (image,
 * code, callout, …). Widgets are inserted from the toolbar's Insert menu and
 * rendered by the editor's per-type slots. Their on-disk form is whatever
 * `vuewrite/markdown` already emits for the block (e.g. `<img src/>`, ``` fences,
 * `<type attr/>` for custom types), so storage is free — this registry only
 * drives the *editing* surface; the page renders widgets through the user's own
 * viewer component (a `TextViewer` slot per type).
 *
 * Built-ins are a small curated set; sites add their own via `defineWidget`
 * (`mechanica/widgets`) in `src/widgets/*.ts`, collected by the Vite plugin.
 */
export interface RichTextWidget {
  /** vuewrite block `type` (and the slot name used to render it). */
  type: string
  /** Insert-menu label. */
  title: string
  /** A built-in VIcon name, or a raw `<svg …>` string (e.g. a Figma export). */
  icon: string
  /** Extra terms to match when searching the insert menu. */
  keywords?: string[]
  /** A fresh block to insert. */
  create(): Partial<Block>
  /**
   * Editing component, rendered in place of the block inside the editor.
   * Receives `block` (mutate it directly) and must emit `change` after a
   * mutation so the edit lands in undo history. Omit for widgets that stay
   * plain editable text styled by the renderer (like the callout).
   */
  editor?: Component
}

const builtinWidgets: RichTextWidget[] = [
  {
    type: 'img',
    title: 'Image',
    icon: 'image',
    keywords: ['image', 'picture', 'photo', 'upload'],
    create: () => ({ type: 'img', editable: false, src: '' }),
    editor: RichImageWidget,
  },
  {
    type: 'code',
    title: 'Code',
    icon: 'code',
    keywords: ['code', 'snippet', 'pre'],
    // editable:false → the widget component owns its own textarea (not vuewrite text).
    create: () => ({ type: 'code', editable: false, text: '', lang: '' }),
    editor: RichCodeWidget,
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

/** Block types owned by the core renderer/codec — widgets can't claim them. */
const RESERVED_TYPES = new Set(['h1', 'h2', 'h3', 'li', 'ol', 'hr'])

const userWidgets: RichTextWidget[] = []

/** Raw-SVG icons get the same color normalization as the `?svg-glob` set. */
const normalizeIcon = (icon: string): string =>
  icon.trimStart().startsWith('<svg')
    ? icon
        .replace(/"#[0-9A-Za-z]+"/g, '"currentColor"')
        .replace(/"(white|black)"/g, '"currentColor"')
    : icon

/**
 * Register site-defined widgets (from `virtual:mechanica/widgets`). Called once
 * by the editor entry before mount. Invalid or conflicting entries are skipped
 * with a warning rather than breaking the editor.
 */
export function registerRichTextWidgets(widgets: RichTextWidget[]): void {
  for (const widget of widgets) {
    if (!widget || typeof widget.type !== 'string' || !widget.type || typeof widget.create !== 'function') {
      console.warn('[mechanica] Ignoring invalid rich-text widget:', widget)
      continue
    }
    if (RESERVED_TYPES.has(widget.type) || allRichTextWidgets().some((w) => w.type === widget.type)) {
      console.warn(`[mechanica] Rich-text widget type "${widget.type}" is already taken — skipped.`)
      continue
    }
    userWidgets.push({ ...widget, icon: normalizeIcon(widget.icon ?? '') })
  }
}

/** Every available widget, built-ins first — drives the Insert menu and slots. */
export function allRichTextWidgets(): RichTextWidget[] {
  return [...builtinWidgets, ...userWidgets]
}

/** Drop all site-registered widgets (tests). */
export function clearRegisteredWidgets(): void {
  userWidgets.length = 0
}
