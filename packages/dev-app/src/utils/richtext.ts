import type { Block, Style } from 'vuewrite'

// Page-side rendering config for vuewrite rich text. Mirrors the editor's config
// (mechanica's fields/richtext/config.ts) so what you format in the editor is
// exactly what the page shows. TextViewer is SSR-safe, so these render in the
// static export too.

export const renderer = (block: Block) => {
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
      const tone = (block as { tone?: unknown }).tone
      return { tag: 'div', className: `rt-callout rt-callout--${typeof tone === 'string' ? tone : 'info'}` }
    }
  }
}

export const decorator = (style: Style) => {
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
  }
}

export const listParser = (block: Block) => {
  if (block.type === 'li') return 'ul'
  if (block.type === 'ol') return 'ol'
}
