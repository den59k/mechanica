<template>
  <main class="bare-layout">
    <Content />
  </main>
</template>

<script setup lang="ts">
import { Content } from 'mechanica'

// A chrome-less shell for standalone pages (404, a form landing) — no header,
// no footer, just the page's blocks. Picked per page via `layout: bare`.
</script>

<style scoped>
.bare-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
