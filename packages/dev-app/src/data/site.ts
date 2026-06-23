import { defineData } from 'mechanica'

/**
 * Site-wide settings, editable from the editor's Data tab. Because the scope is
 * `'site'`, the value is shared across every page (persisted to `.mech/data.json`).
 */
export const useSiteSettings = defineData({
  id: 'site',
  title: 'Site settings',
  scope: 'site',
  props: {
    name: { type: 'string', default: 'Mechanica' },
    tagline: 'text',
  },
})
