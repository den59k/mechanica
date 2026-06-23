<template>
  <section class="section" :class="{ 'section--muted': props.muted }">
    <slot />
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Section',
  category: 'Layout',
  props: {
    muted: { type: 'boolean', default: false },
  },
})
</script>

<style scoped>
.section {
  padding: 32px 20px;
  border-radius: 12px;
}
.section--muted {
  background: #f3f4f6;
}
</style>
