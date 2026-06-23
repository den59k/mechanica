<template>
  <div class="features">
    <div v-for="(item, index) in props.items" :key="index" class="feature">
      <h3>{{ item.title }}</h3>
      <p>{{ item.text }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Features',
  category: 'Content',
  props: {
    items: { type: 'array', items: { title: 'string', text: 'text' } },
  },
})
</script>
