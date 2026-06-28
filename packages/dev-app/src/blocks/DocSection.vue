<template>
  <section class="docsection">
    <h2 :id="id" class="docsection__heading">
      {{ props.title }}
      <a class="docsection__anchor" :href="`#${id}`" aria-label="Permalink to this section" />
    </h2>
    <div class="docsection__body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { slug } from '../utils/slug'

const props = defineBlock({
  name: 'Doc section',
  category: 'Docs',
  description: 'A documentation section: an anchored H2 with a content slot',
  props: { title: { type: 'string', default: 'Section' } },
})

const id = computed(() => slug(props.title))
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
.docsection__body > :deep(* + *) {
  margin-top: 16px;
}
</style>
