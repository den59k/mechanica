import { defineComposerComponents } from 'mechanica'
import UiButton from './components/UiButton.vue'

/**
 * The Block Composer's components manifest — your site's design system, offered
 * to designers as building material in the visual composer. Each entry is a
 * plain Vue component plus the compact-json-schema for its editable props.
 * Add your own Card, Badge, Avatar, … here as you build them.
 */
export default defineComposerComponents({
  button: {
    component: UiButton,
    name: 'Button',
    icon: 'button',
    props: {
      label: { type: 'string', default: 'Button' },
      link: { type: 'string', format: 'smartLink' },
      variant: { type: 'string', enum: ['primary', 'secondary'], default: 'primary' },
    },
    previewData: { label: 'Get started' },
  },
})
