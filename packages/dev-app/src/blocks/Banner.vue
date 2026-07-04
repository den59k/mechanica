<template>
  <section class="banner">
    <!-- <Image> renders the field value completely: alt, intrinsic dimensions
         (no layout shift), lazy loading, and the LQIP blur-up preview. Pass
         `eager` instead when the image is above the fold (hero/LCP). -->
    <Image :image="props.image" class="banner__image" />
    <div class="banner__body">
      <h2 class="banner__heading">{{ props.heading }}</h2>
      <p v-if="props.caption" class="banner__caption">{{ props.caption }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Image } from 'mechanica'

// Demonstrates the `image` field: pick the block, then use Upload in the editor
// to push a file to the dev server (`/@mechanica/upload` → `.mech/assets`).
const props = defineBlock({
  name: 'Banner',
  category: 'Media',
  description: 'A heading + caption over an uploaded image',
  props: {
    image: 'image',
    heading: { type: 'string', default: 'Banner heading' },
    caption: 'text',
  },
  // A data-URI image keeps the preview self-contained (no upload, no network)
  // and exercises <Image>'s dimension attributes.
  previewData: {
    image: {
      src:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='500'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234f8ef7'/%3E%3Cstop offset='1' stop-color='%23172554'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='500' fill='url(%23g)'/%3E%3C/svg%3E",
      alt: 'Blue gradient banner backdrop',
      width: 1200,
      height: 500,
    },
    heading: 'Where ideas take shape',
    caption: 'A heading and caption over an uploaded image.',
  },
})
</script>

<style scoped>
.banner {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  color: #fff;
}
.banner__image {
  display: block;
  width: 100%;
  height: 260px;
  object-fit: cover;
}
.banner__body {
  position: absolute;
  inset: auto 0 0 0;
  padding: 20px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
}
.banner__heading {
  margin: 0;
  font-size: 28px;
}
.banner__caption {
  margin: 6px 0 0;
  opacity: 0.85;
}
</style>
