<template>
  <Layout />
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { Layout } from 'mechanica'
import { useSiteSettings } from './data/site'
import { useHead } from './data/head'
import './styles/site.scss'

// The root only carries site-global concerns (styles, title sync); the page
// chrome lives in layouts (src/layouts, declared in main.ts) — <Layout/>
// renders the one the current page picks via `layout:` frontmatter, with the
// site shell (header + footer) as the default.
const site = useSiteSettings()
const head = useHead()

// Keep the document title in sync with page-head data (live in the editor and
// across SPA navigation); the build templates it into index.html too.
watchEffect(() => {
  if (typeof document !== 'undefined' && head.title) document.title = head.title
})

// `site` is referenced here so the site-settings data entry always registers.
void site
</script>
