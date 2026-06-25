import { defineData } from 'mechanica'

/**
 * Site-wide settings, editable from the editor's Page data dialog. Set it at
 * Site scope so the value is shared across every page (`.mech/data.json`).
 */
export const useSiteSettings = defineData({
  id: 'site',
  title: 'Site settings',
  props: {
    name: { type: 'string', default: 'Mechanica' },
    tagline: 'text',
  },
})
