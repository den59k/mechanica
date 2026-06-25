<template>
  <Content />
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { Content } from 'mechanica'
import { useSiteSettings } from './data/site'
import { useHead } from './data/head'
import './styles/site.scss'

// The shell is now intentionally bare: site chrome (nav, footer) is composed
// from blocks, so every page is full-bleed and the blocks own their own width.
const site = useSiteSettings()
const head = useHead()

// Keep the document title in sync with page-head data (live in the editor and
// across SPA navigation); the build templates it into index.html too.
watchEffect(() => {
  if (typeof document !== 'undefined' && head.title) document.title = head.title
})

// `site` is read by blocks (e.g. the Navbar brand); referenced here so this
// entry always registers the site-scoped data entry.
void site
</script>
