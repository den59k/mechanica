import { defineData } from 'mechanica'

/**
 * Per-page <head> metadata. Page-scoped, so every page sets its own values,
 * which are templated into index.html via `{{ head.* }}` placeholders. This is
 * the approach for larger sites that need distinct title/description/OG tags per
 * page; tiny landing pages can skip it and hardcode their <head> instead.
 */
export const useHead = defineData({
  id: 'head',
  title: 'Page head',
  scope: 'page',
  props: {
    title: { type: 'string', default: 'Mechanica dev-app' },
    description: { type: 'string', default: 'Build Vue sites with a visual block editor.' },
  },
})
