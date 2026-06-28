<template>
  <div class="prose" v-html="html" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'

// Plain Markdown prose, authored as a clean @field region in the .page.md and
// rendered with markdown-it. (The vuewrite WYSIWYG path is the `Rich text` block.)
const props = defineBlock({
  name: 'Prose',
  category: 'Docs',
  description: 'A block of Markdown prose — paragraphs, lists, links, emphasis',
  props: {
    body: {
      type: 'string',
      format: 'text',
      default: 'Write **Markdown** here — paragraphs, _emphasis_, `code`, [links](/), and lists.',
    },
  },
})

const html = computed(() => renderMarkdown(props.body))
</script>

<style scoped>
.prose {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-2);
}
.prose :deep(p) {
  margin: 0 0 14px;
}
.prose :deep(> :last-child) {
  margin-bottom: 0;
}
.prose :deep(h3) {
  margin: 28px 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}
.prose :deep(a) {
  color: var(--brand);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose :deep(ul),
.prose :deep(ol) {
  margin: 0 0 14px;
  padding-left: 22px;
}
.prose :deep(ul) {
  list-style: disc;
}
.prose :deep(ol) {
  list-style: decimal;
}
.prose :deep(li) {
  margin: 4px 0;
}
.prose :deep(li)::marker {
  color: var(--muted);
}
.prose :deep(strong) {
  color: var(--ink);
  font-weight: 700;
}
.prose :deep(code) {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.88em;
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.prose :deep(blockquote) {
  margin: 16px 0;
  padding: 4px 16px;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
</style>
