import { defineComposer } from 'mechanica'
import UiButton from './components/UiButton.vue'
import Badge from './components/Badge.vue'

/**
 * The Block Composer manifest — the site's design system, offered to designers as
 * building material in the visual composer:
 *  - `components`: plain Vue SFCs + compact-json-schema for their props (same
 *    field registry as blocks). A bare string re-exposes a compiled page block by
 *    id (here `card`), so a hero can contain the site's Card without duplicating it.
 *  - `classes`: real CSS classes from `styles/site.scss`, offered as element
 *    **Style** — pick "Container" on a frame and it gets the site's centered
 *    content column; the class stays the single source of truth.
 *  - `breakpoints`: the element-system max-widths (numeric literals only).
 */
export default defineComposer({
  components: {
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
  },
  classes: {
    'ds-container': { title: 'Container', on: 'frame' },
    'ds-display': { title: 'Display heading', on: 'text' },
    'ds-lead': { title: 'Lead paragraph', on: 'text' },
  },
  breakpoints: { md: 1024, sm: 640 },
})
