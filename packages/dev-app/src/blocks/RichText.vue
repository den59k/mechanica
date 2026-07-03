<template>
  <RichTextView :value="value" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from 'vuewrite'
import RichTextView from '../components/RichTextView.vue'

// A standalone rich-text region: a vuewrite document (Block[]) authored as a
// Markdown `@content` region, edited inline with the WYSIWYG ⇄ Markdown switch
// and its Insert menu (image / code / callout widgets). DocSection is the same
// field with a heading; this is the bare version.
const props = defineBlock({
  name: 'Rich text',
  category: 'Docs',
  description: 'A standalone rich-text region with inline widgets',
  // The vuewrite viewer is heavy relative to other blocks — pages without
  // rich text shouldn't download it (`blockChunks` in the plugin docs).
  chunk: 'richtext',
  props: { content: 'richText' },
  previewData: {
    content: [
      { id: 'p1', type: 'h2', text: 'Write anything' },
      {
        id: 'p2',
        text: 'Prose with bold and linked text, plus inline widgets like the CTA button below.',
        styles: [
          { start: 11, end: 15, style: 'bold' },
          { start: 20, end: 26, style: 'link', meta: { href: '/' } },
        ],
      },
      { id: 'p3', type: 'cta', editable: false, label: 'Get started', href: '/', variant: 'primary' },
      {
        id: 'p4',
        type: 'table',
        editable: false,
        text: '',
        rows: [
          [{ text: 'Plan' }, { text: 'Pages' }, { text: 'Price' }],
          [{ text: 'Free' }, { text: '3' }, { text: '$0' }],
          [{ text: 'Pro' }, { text: 'Unlimited' }, { text: '$12/mo' }],
        ],
      },
    ],
  },
})

const value = computed<Block[]>(() => {
  const blocks = props.content as Block[] | undefined
  return blocks && blocks.length ? blocks : [{ id: '0', text: '' }]
})
</script>
