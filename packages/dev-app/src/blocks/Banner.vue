<template>
  <section class="banner">
    <!-- alt + intrinsic width/height come from the image field (authored alt,
         dimensions captured at pick/upload) — no layout shift, SEO-friendly. -->
    <img
      v-if="props.image?.src"
      :src="props.image.src"
      :alt="props.image.alt || props.heading"
      :width="props.image.width"
      :height="props.image.height"
      class="banner__image"
    />
    <div class="banner__body">
      <h2 class="banner__heading">{{ props.heading }}</h2>
      <p v-if="props.caption" class="banner__caption">{{ props.caption }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
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
