<template>
  <div class="card">
    <h3 v-if="props.title" class="card__title">{{ props.title }}</h3>
    <div class="card__body">
      <!-- A default <slot> makes this a container: drag other blocks inside it
           in the editor (drop onto the middle of the card to nest). -->
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Card',
  category: 'Layout',
  description: 'A titled container — drop blocks inside it',
  props: {
    title: { type: 'string', default: 'Card title' },
  },
})
</script>

<style scoped>
.card {
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}
.card__title {
  margin: 0 0 12px;
  font-size: 18px;
}
.card__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* Give an empty slot a visible drop target while authoring. */
.card__body:empty::before {
  content: 'Drop blocks here';
  display: block;
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
}
</style>
