import { defineData } from 'mechanica'

/**
 * Per-post metadata, set at "This page" scope on each blog post. The blog
 * index queries it (`usePagination({ data: [usePostMeta], sort: … })`) to
 * order posts by date and show teasers.
 */
export const usePostMeta = defineData({
  id: 'postMeta',
  title: 'Post meta',
  props: {
    date: { type: 'string', default: '' },
    description: { type: 'string', format: 'text', default: '' },
  },
})
