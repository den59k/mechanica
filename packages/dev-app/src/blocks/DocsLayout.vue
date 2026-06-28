<template>
  <div class="docslayout mc-container">
    <DocsNav class="docslayout__nav" :folder="props.folder" />
    <main class="docslayout__main docs-content"><slot /></main>
    <DocsToc class="docslayout__toc" />
  </div>
</template>

<script setup lang="ts">
// The documentation shell, as a *block*: a three-column layout with the docs
// page-nav on the left, the page's section blocks in the default slot, and an
// "on this page" table of contents on the right. Being a block (not App-level
// chrome) keeps it correct under SSR/static export — it's just page content.
import DocsNav from '../components/DocsNav.vue'
import DocsToc from '../components/DocsToc.vue'

const props = defineBlock({
  name: 'Docs layout',
  category: 'Docs',
  description: 'Three-column docs shell: page nav, content slot, on-this-page ToC',
  props: { folder: { type: 'string', default: 'docs', label: 'Folder' } },
})
</script>

<style scoped>
.docslayout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 196px;
  gap: 44px;
  align-items: start;
  padding-top: 44px;
  padding-bottom: 96px;
}
.docslayout__main {
  min-width: 0;
  max-width: 752px;
}
@media (max-width: 1080px) {
  .docslayout {
    grid-template-columns: 210px minmax(0, 1fr);
  }
  .docslayout__toc {
    display: none;
  }
}
@media (max-width: 800px) {
  .docslayout {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
