<template>
  <aside class="callout" :class="`callout--${props.tone}`">
    <div class="callout__icon" aria-hidden="true">{{ icon }}</div>
    <div class="callout__content">
      <p v-if="props.title" class="callout__title">{{ props.title }}</p>
      <TextViewer
        class="callout__body"
        :model-value="body"
        :renderer="renderer"
        :decorator="decorator"
        :list-parser="listParser"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TextViewer } from 'vuewrite'
import type { Block } from 'vuewrite'
import { renderer, decorator, listParser } from '../utils/richtext'

const props = defineBlock({
  name: 'Callout',
  category: 'Docs',
  description: 'An info / tip / warning admonition with a rich-text body',
  props: {
    tone: { type: 'string', enum: ['info', 'tip', 'warning'], default: 'info', label: 'Tone' },
    title: { type: 'string', default: '' },
    body: 'richText',
  },
})

const icons: Record<string, string> = { info: 'i', tip: '✓', warning: '!' }
const icon = computed(() => icons[props.tone] ?? 'i')
const body = computed<Block[]>(() => {
  const value = props.body as Block[] | undefined
  return value && value.length ? value : [{ id: '0', text: '' }]
})
</script>

<style scoped>
.callout {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--c-border);
  border-left-width: 3px;
  border-radius: var(--radius-sm);
  background: var(--c-soft);
}
.callout--info {
  --c-border: #b9c8f5;
  --c-soft: #eef2fe;
  --c-accent: #3b5bdb;
}
.callout--tip {
  --c-border: #aee0c4;
  --c-soft: #eaf8f0;
  --c-accent: #16a34a;
}
.callout--warning {
  --c-border: #f4d39a;
  --c-soft: #fdf4e3;
  --c-accent: #c2710c;
}
.callout__icon {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  font-style: italic;
  background: var(--c-accent);
  color: #fff;
}
.callout__title {
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 2px;
}
.callout__content {
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-2);
}
.callout__body :deep(p) {
  margin: 0 0 8px;
}
.callout__body :deep(> :last-child) {
  margin-bottom: 0;
}
.callout__body :deep(b) {
  font-weight: 700;
}
.callout__body :deep(i) {
  font-style: italic;
}
.callout__body :deep(a) {
  color: var(--c-accent);
  font-weight: 500;
  text-decoration: underline;
}
.callout__body :deep(code) {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 0.88em;
  background: rgba(255, 255, 255, 0.6);
  padding: 1px 5px;
  border-radius: 5px;
}
</style>
