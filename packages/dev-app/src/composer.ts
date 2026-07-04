import { defineComposerComponents } from 'mechanica'
import UiButton from './components/UiButton.vue'
import Badge from './components/Badge.vue'

/**
 * The Block Composer's components manifest — the site's design system, offered
 * to designers as building material in the visual composer. Each entry is a
 * plain Vue SFC plus the compact-json-schema for its editable props (same field
 * registry as blocks). Composed blocks that place these render everywhere.
 *
 * A bare string value re-exposes an existing compiled page block by id (here the
 * `card` block), so a hero can contain the site's Card without duplicating it.
 */
export default defineComposerComponents({
  button: {
    component: UiButton,
    name: 'Button',
    icon: 'button',
    props: {
      label: { type: 'string', default: 'Button' },
      link: { type: 'string', format: 'smartLink' },
      variant: { type: 'string', enum: ['primary', 'secondary', 'ghost'], default: 'primary' },
    },
    previewData: { label: 'Get started' },
  },
  badge: {
    component: Badge,
    name: 'Badge',
    icon: 'star',
    props: {
      text: { type: 'string', default: 'New' },
      tone: { type: 'string', enum: ['accent', 'positive', 'neutral'], default: 'accent' },
    },
    previewData: { text: 'New', tone: 'accent' },
  },
  card: 'card',
})
