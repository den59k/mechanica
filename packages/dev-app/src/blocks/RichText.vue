<template>
  <div class="richtext">
    <TextViewer v-if="mounted" :model-value="value" />
    <div v-else class="richtext__ssr">{{ plain }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'

// The vuewrite WYSIWYG block — the rich-text field is edited inline in the
// editor and its `Block[]` value rendered read-only here. vuewrite is loaded
// only on the client (dynamic import + `mounted` guard) so SSR/static export
// renders a plain-text fallback and hydrates cleanly.
const TextViewer = defineAsyncComponent(() => import('vuewrite').then((m) => m.TextViewer))

type RichBlock = { text: string }

const props = defineBlock({
  name: 'Rich text',
  category: 'Docs',
  description: 'WYSIWYG rich text, edited inline with the vuewrite editor',
  props: { content: 'richText' },
})

const mounted = ref(false)
onMounted(() => (mounted.value = true))

const value = computed<RichBlock[]>(() => {
  const blocks = props.content as RichBlock[] | undefined
  return blocks && blocks.length ? blocks : [{ text: '' }]
})
const plain = computed(() => value.value.map((block) => block.text).join('\n'))
</script>

<style scoped>
.richtext {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-2);
}
.richtext :deep(h1),
.richtext :deep(h2),
.richtext :deep(h3) {
  color: var(--ink);
  font-weight: 700;
}
.richtext :deep(a) {
  color: var(--brand);
  text-decoration: underline;
}
.richtext__ssr {
  white-space: pre-wrap;
}
</style>
