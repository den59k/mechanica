import { defineComposer } from 'mechanica'
import UiButton from './components/UiButton.vue'

/**
 * The Block Composer manifest — your site's design system, offered to designers
 * as building material in the visual composer:
 *  - `components`: plain Vue components + compact-json-schema for their props.
 *    Add your own Card, Badge, Avatar, … here as you build them.
 *  - `classes`: real CSS classes from your stylesheet, offered as element
 *    **Style** (e.g. `container: { title: 'Container', on: 'frame' }`).
 *  - `breakpoints`: the element-system max-widths (numeric literals only;
 *    defaults `{ md: 1024, sm: 640 }`).
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
        variant: { type: 'string', enum: ['primary', 'secondary'], default: 'primary' },
      },
      previewData: { label: 'Get started' },
    },
  },
})
