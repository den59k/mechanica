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
  props: { content: 'richText' },
})

const value = computed<Block[]>(() => {
  const blocks = props.content as Block[] | undefined
  return blocks && blocks.length ? blocks : [{ id: '0', text: '' }]
})
</script>
