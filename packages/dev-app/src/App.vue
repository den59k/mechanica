<template>
  <SiteHeader />
  <Content />
  <SiteFooter />
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { Content } from 'mechanica'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { useSiteSettings } from './data/site'
import { useHead } from './data/head'
import './styles/site.scss'

// Site chrome (header, footer) is identical on every page, so it lives here —
// outside <Content/> — configured via shared `defineData` (navbar/footer) rather
// than as content blocks placed on each page.
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
