<template>
  <Content />
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { Content } from 'mechanica'
import { useHead } from './data/head'
import './styles/site.scss'

// Site-wide chrome (header, footer) belongs here, outside <Content/> — it is
// identical on every page, configured via shared `defineData` entries rather
// than as content blocks placed on each page.

// Keep the document title in sync with page-head data (live in the editor and
// across SPA navigation); the build templates it into index.html too.
const head = useHead()
watchEffect(() => {
  if (typeof document !== 'undefined' && head.title) document.title = head.title
})
</script>
