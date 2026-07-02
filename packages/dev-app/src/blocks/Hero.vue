<template>
  <section class="hero">
    <h1>{{ props.title }}</h1>
    <p v-if="props.subtitle">{{ props.subtitle }}</p>
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Hero',
  category: 'Content',
  props: {
    title: { type: 'string', default: 'Hello' },
    subtitle: 'text',
  },
  previewData: {
    title: 'Build sites visually',
    subtitle: 'Blocks are plain Vue components — this text comes from previewData.',
  },
})
</script>
