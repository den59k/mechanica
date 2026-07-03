import { defineData } from 'mechanica'

/**
 * Per-page <head> metadata, templated into index.html via `{{ head.* }}`
 * placeholders. Typically set at "This page" scope so every page has its own
 * title/description; a site-wide default can be set at Site scope.
 */
export const useHead = defineData({
  id: 'head',
  title: 'Page head',
  props: {
    title: { type: 'string', default: 'My Mechanica site' },
    description: { type: 'string', default: 'A site built with Mechanica.' },
  },
})
