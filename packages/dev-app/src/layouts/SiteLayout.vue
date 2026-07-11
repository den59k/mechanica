<template>
  <SiteHeader />
  <Content />
  <SiteFooter />
</template>

<script setup lang="ts">
import { Content } from 'mechanica'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

// The default site shell: header + footer around the page content. Chrome is
// configured via shared `defineData` (navbar/footer), not per-page blocks.
</script>
