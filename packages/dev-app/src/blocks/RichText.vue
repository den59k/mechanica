<template>
  <TextViewer
    class="richtext"
    :model-value="value"
    :renderer="renderer"
    :decorator="decorator"
    :list-parser="listParser"
  >
    <template #img="{ block }">
      <img class="richtext__img" :src="(block.src as string)" :alt="((block.alt as string) ?? '')" />
    </template>
    <template #code="{ block }">
      <div class="richtext__code">
        <span v-if="block.lang" class="richtext__code-lang">{{ block.lang }}</span>
        <pre><code>{{ block.text }}</code></pre>
      </div>
    </template>
  </TextViewer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TextViewer } from 'vuewrite'
import type { Block } from 'vuewrite'
import { renderer, decorator, listParser } from '../utils/richtext'

// The rich-text block — its value is a vuewrite document (Block[]), authored as a
// Markdown `@content` region on disk and edited inline with the WYSIWYG ⇄ Markdown
// switch. TextViewer is SSR-safe, so it renders in the static export too. (This is
// the same field type Prose and Callout use; kept as a standalone block for a bare
// rich-text region.)
const props = defineBlock({
  name: 'Rich text',
  category: 'Docs',
  description: 'A standalone rich-text region, edited inline with the vuewrite editor',
  props: { content: 'richText' },
})

const value = computed<Block[]>(() => {
  const blocks = props.content as Block[] | undefined
  return blocks && blocks.length ? blocks : [{ id: '0', text: '' }]
})
</script>

<style scoped>
.richtext {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-2);
}
.richtext :deep(p) {
  margin: 0 0 14px;
}
.richtext :deep(> :last-child) {
  margin-bottom: 0;
}
.richtext :deep(h1),
.richtext :deep(h2),
.richtext :deep(h3) {
  color: var(--ink);
  font-weight: 700;
  margin: 0.6em 0 0.3em;
}
.richtext :deep(h1) {
  font-size: 1.5em;
}
.richtext :deep(h2) {
  font-size: 1.3em;
}
.richtext :deep(h3) {
  font-size: 1.1em;
}
.richtext :deep(b) {
  font-weight: 700;
  color: var(--ink);
}
.richtext :deep(i) {
  font-style: italic;
}
.richtext :deep(u) {
  text-decoration: underline;
}
.richtext :deep(ul),
.richtext :deep(ol) {
  margin: 0 0 14px;
  padding-left: 22px;
}
.richtext :deep(ul) {
  list-style: disc;
}
.richtext :deep(ol) {
  list-style: decimal;
}
.richtext :deep(li) {
  margin: 4px 0;
}
.richtext :deep(a) {
  color: var(--brand);
  text-decoration: underline;
}
.richtext :deep(code) {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.88em;
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.richtext__img {
  display: block;
  max-width: 100%;
  margin: 16px 0;
  border-radius: 8px;
}
.richtext :deep(.rt-callout) {
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid var(--c-border);
  border-left-width: 3px;
  border-radius: var(--radius-sm);
  background: var(--c-soft);
  --c-border: #b9c8f5;
  --c-soft: #eef2fe;
}
.richtext :deep(.rt-callout--tip) {
  --c-border: #aee0c4;
  --c-soft: #eaf8f0;
}
.richtext :deep(.rt-callout--warning) {
  --c-border: #f4d39a;
  --c-soft: #fdf4e3;
}
.richtext__code {
  position: relative;
  margin: 16px 0;
  border-radius: 8px;
  background: var(--ink-section);
  overflow: hidden;
}
.richtext__code-lang {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #888da0;
}
.richtext__code pre {
  margin: 0;
  padding: 16px 18px;
  overflow-x: auto;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #e7e9f2;
}
</style>
