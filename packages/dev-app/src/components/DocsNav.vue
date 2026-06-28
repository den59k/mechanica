<template>
  <nav class="docsnav" aria-label="Documentation">
    <p class="docsnav__label">Documentation</p>
    <ul class="docsnav__list">
      <li v-for="page in pages" :key="page.path">
        <Link :to="page.path" class="docsnav__link">{{ page.name }}</Link>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { Link, usePages } from 'mechanica'

// Pages in the docs folder, already sorted by their `order`. The folder query +
// sorting live in the runtime: usePages → getPages → listPages.
const props = defineProps<{ folder: string }>()
const pages = usePages({ folderName: props.folder })
</script>

<style scoped>
.docsnav {
  position: sticky;
  top: 88px;
}
.docsnav__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}
.docsnav__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.docsnav__link {
  display: block;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 14.5px;
  color: var(--ink-2);
  transition:
    background 0.12s,
    color 0.12s;
}
.docsnav__link:hover {
  background: var(--surface);
  color: var(--ink);
}
.docsnav__link.is-active {
  color: var(--brand);
  font-weight: 600;
  background: var(--brand-soft);
}
</style>
