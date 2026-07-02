<template>
  <section class="split">
    <div class="mc-container split__grid">
      <div class="split__col"><slot name="start" /></div>
      <div class="split__col"><slot name="end" /></div>
    </div>
  </section>
</template>

<script setup lang="ts">
// A layout block with two *named* slots (start / end). Blocks are placed into a
// specific named slot from the editor's layers tree (drag a block onto the slot).
defineBlock({
  name: 'Split',
  category: 'Layout',
  description: 'Two side-by-side named slots — start and end',
  previewData: {
    $slots: {
      start: [{ blockId: 'card', data: { title: 'Start column' } }],
    },
  },
})
</script>

<style scoped>
.split {
  padding: 40px 0;
}
.split__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}
.split__col {
  min-height: 80px;
  border-radius: var(--radius);
}
@media (max-width: 720px) {
  .split__grid {
    grid-template-columns: 1fr;
  }
}
</style>
