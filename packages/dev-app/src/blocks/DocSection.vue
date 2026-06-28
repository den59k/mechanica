<template>
  <section class="docsection">
    <h2 :id="id" class="docsection__heading">
      {{ props.title }}
      <a class="docsection__anchor" :href="`#${id}`" aria-label="Permalink to this section" />
    </h2>
    <RichTextView class="docsection__body" :value="content" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from 'vuewrite'
import { slug } from '../utils/slug'
import RichTextView from '../components/RichTextView.vue'

// A documentation section: a navigable H2 (the title also feeds the page nav and
// the on-this-page ToC) plus a single rich-text `content` field. Prose, code,
// callouts and images all live inside `content` as vuewrite widgets — no nested
// blocks.
const props = defineBlock({
  name: 'Doc section',
  category: 'Docs',
  description: 'An anchored H2 with a rich-text body (prose + inline widgets)',
  props: {
    title: { type: 'string', default: 'Section' },
    content: 'richText',
  },
})

const id = computed(() => slug(props.title))
const content = computed<Block[]>(() => {
  const value = props.content as Block[] | undefined
  return value && value.length ? value : [{ id: '0', text: '' }]
})
</script>

<style scoped>
.docsection {
  margin-top: 44px;
  scroll-margin-top: 88px;
}
.docsection:first-child {
  margin-top: 0;
}
.docsection__heading {
  position: relative;
  font-size: 24px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--ink);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.docsection__anchor {
  margin-left: 6px;
  color: var(--brand);
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.12s;
}
.docsection__anchor::before {
  content: '#';
}
.docsection__heading:hover .docsection__anchor {
  opacity: 1;
}
.docsection__body {
  margin-top: 18px;
}
</style>
