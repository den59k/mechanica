<template>
  <main class="app">
    <header class="app__header">
      <strong>{{ site.name }}</strong>
      <span v-if="site.tagline" class="app__tagline">{{ site.tagline }}</span>
    </header>
    <Content />
  </main>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { Content } from 'mechanica'
import { useSiteSettings } from './data/site'
import { useHead } from './data/head'

const site = useSiteSettings()

// Keep the document title in sync with the page-head data (live in the editor
// and across client-side navigation); the build templates it into index.html.
const head = useHead()
watchEffect(() => {
  if (typeof document !== 'undefined' && head.title) document.title = head.title
})
</script>

<style>
.app {
  max-width: 880px;
  margin: 0 auto;
  font-family: system-ui, sans-serif;
}
.app__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid #e5e7eb;
}
.app__tagline {
  color: #6b7280;
}
</style>
