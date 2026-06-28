<template>
  <TextViewer
    class="prose"
    :model-value="body"
    :renderer="renderer"
    :decorator="decorator"
    :list-parser="listParser"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TextViewer } from 'vuewrite'
import type { Block } from 'vuewrite'
import { renderer, decorator, listParser } from '../utils/richtext'

// A block of rich text — authored as a clean Markdown `@body` region on disk,
// loaded as a vuewrite document (Block[]) and rendered read-only here. Edit it in
// the editor with the WYSIWYG ⇄ Markdown switch. TextViewer is SSR-safe, so this
// renders in the static export too.
const props = defineBlock({
  name: 'Prose',
  category: 'Docs',
  description: 'A block of rich text — paragraphs, lists, links, emphasis, code',
  props: { body: 'richText' },
})

const body = computed<Block[]>(() => {
  const value = props.body as Block[] | undefined
  return value && value.length ? value : [{ id: '0', text: '' }]
})
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
.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3) {
  color: var(--ink);
  font-weight: 700;
  margin: 28px 0 10px;
}
.prose :deep(h1) {
  font-size: 22px;
}
.prose :deep(h2) {
  font-size: 19px;
}
.prose :deep(h3) {
  font-size: 18px;
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
.prose :deep(b) {
  color: var(--ink);
  font-weight: 700;
}
.prose :deep(i) {
  font-style: italic;
}
.prose :deep(code) {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.88em;
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
</style>
