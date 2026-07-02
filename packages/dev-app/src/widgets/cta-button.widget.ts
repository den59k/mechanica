import { defineWidget } from 'mechanica/widgets'
import CtaButtonEditor from './CtaButtonEditor.vue'

// A call-to-action button that flows inside rich text. Persists in .page.md as
// `<cta label="…" href="…" variant="primary"/>`; the page renders it through
// RichTextView's `#cta` slot.
export default defineWidget({
  type: 'cta',
  title: 'CTA button',
  icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="10" rx="5" stroke="currentColor" stroke-width="2"/><path d="M8 12h8m0 0-2.5-2.5M16 12l-2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  keywords: ['button', 'link', 'cta', 'action'],
  create: () => ({ type: 'cta', editable: false, label: 'Get started', href: '/', variant: 'primary' }),
  editor: CtaButtonEditor,
})
