import type { Block, Style } from 'vuewrite'

// Shared vuewrite rendering config for Mechanica's rich-text field. The block
// types here are exactly the ones `vuewrite/markdown` round-trips (h1–h3, li,
// ol, code, hr) plus the inline styles below, so what you format in the editor
// survives the Markdown stored on disk. The page-side viewer mirrors this.

/** Map a block to its HTML tag/class. `code` is handled by a slot, not here. */
export const renderer = (block: Block): { tag: string; className?: string } | undefined => {
  // A plain paragraph renders as <p> (not <div>) so it gets real paragraph
  // spacing in both the editor and the page.
  if (!block.type) return { tag: 'p' }
  switch (block.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'li':
      return { tag: block.type }
    case 'ol':
      return { tag: 'li', className: 'ol' }
    case 'hr':
      return { tag: 'hr' }
    case 'callout': {
      // Editable rich text in a toned admonition; tone edited from the toolbar.
      const tone = (block as { tone?: unknown }).tone
      return { tag: 'div', className: `rt-callout rt-callout--${typeof tone === 'string' ? tone : 'info'}` }
    }
    default:
      return undefined
  }
}

/** Map an inline style span to its HTML tag/attributes. */
export const decorator = (style: Style): Record<string, unknown> | undefined => {
  switch (style.style) {
    case 'bold':
      return { tag: 'b' }
    case 'italic':
      return { tag: 'i' }
    case 'underline':
      return { tag: 'u' }
    case 'strikethrough':
      return { tag: 's' }
    case 'code':
      return { tag: 'code' }
    case 'link':
      return { tag: 'a', attrs: { href: style.meta?.href, target: '_blank', rel: 'noopener' } }
    case 'color':
      return { style: `color: ${style.meta?.color};` }
    // Display-only markers for the non-breaking space / hyphen, produced by
    // `typographyParser` at render time (never stored). See lib/typography.ts.
    case 'nbsp':
      return { tag: 'span', class: 'rt-nbsp' }
    case 'nbHyphen':
      return { tag: 'span', class: 'rt-nbhyphen' }
    default:
      return undefined
  }
}

/** Wrap consecutive list items in the right list element. */
export const listCreator = (block: Block): string | undefined => {
  if (block.type === 'li') return 'ul'
  if (block.type === 'ol') return 'ol'
  return undefined
}

/** Map a pasted HTML element to a block type (for paste-as-rich-text). */
export const htmlParser = (el: Element): string | undefined => {
  const tag = el.tagName.toLowerCase()
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'li' || tag === 'hr') return tag
  return undefined
}

/** Toolbar block-type options for VSelect (`'default'` = a plain paragraph). */
export const blockTypes: { value: string; label: string }[] = [
  { value: 'default', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'li', label: 'Bullet list' },
  { value: 'ol', label: 'Numbered list' },
]
