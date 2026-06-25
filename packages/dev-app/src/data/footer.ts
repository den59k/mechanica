import { defineData } from 'mechanica'

/** Site footer content — shared chrome, edited as site-wide data (see navbar). */
export const useFooter = defineData({
  id: 'footer',
  title: 'Footer',
  props: {
    brand: { type: 'string', default: 'Mechanica' },
    note: { type: 'string', format: 'text', default: 'The visual block editor for Vue.' },
    links: {
      type: 'array',
      items: { label: 'string', href: 'string' },
    },
    copyright: { type: 'string', default: '© 2026 Mechanica. MIT licensed.' },
  },
})
