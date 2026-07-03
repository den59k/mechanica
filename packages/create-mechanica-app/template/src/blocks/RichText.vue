<template>
  <section class="richtext-block">
    <div class="container">
      <RichTextView :value="value" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from 'vuewrite'
import RichTextView from '../components/RichTextView.vue'

// A standalone rich-text region: a vuewrite document (Block[]) authored as a
// Markdown `@content` region in the .page.md file, edited inline with the
// WYSIWYG ⇄ Markdown switch and its Insert menu (image / code / callout / table).
const props = defineBlock({
  name: 'Rich text',
  category: 'Content',
  description: 'A prose region with headings, lists, code and tables',
  // The vuewrite viewer is heavy relative to other blocks — pages without
  // rich text shouldn't download it (`blockChunks` in the plugin docs).
  chunk: 'richtext',
  props: { content: 'richText' },
  previewData: {
    content: [
      { id: 'p1', type: 'h2', text: 'Write anything' },
      {
        id: 'p2',
        text: 'Prose with bold and linked text, plus widgets like code blocks and tables.',
        styles: [
          { start: 11, end: 15, style: 'bold' },
          { start: 20, end: 26, style: 'link', meta: { href: '/' } },
        ],
      },
      { id: 'p3', type: 'code', editable: false, lang: 'ts', text: "console.log('Hello, Mechanica')" },
    ],
  },
})

const value = computed<Block[]>(() => {
  const blocks = props.content as Block[] | undefined
  return blocks && blocks.length ? blocks : [{ id: '0', text: '' }]
})
</script>

<style lang="scss" scoped>
.richtext-block {
  padding: 32px 0;
}
</style>
