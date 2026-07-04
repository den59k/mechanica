<template>
  <span class="badge" :class="`badge--${props.tone}`">{{ props.text }}</span>
</template>

<script setup lang="ts">
// A developer-authored component offered to designers *inside the Block
// Composer* (`composable: true`) — not on the page palette (`hidden`). This is
// the "enhance developers" path: ship a styled component with real props, and
// designers drop it into their composed blocks.
const props = defineBlock({
  name: 'Badge',
  icon: 'star',
  hidden: true,
  composable: true,
  description: 'A small status pill',
  props: {
    text: { type: 'string', default: 'New' },
    tone: { type: 'string', enum: ['accent', 'positive', 'neutral'], default: 'accent' },
  },
})
</script>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}
.badge--accent {
  background: #eef2ff;
  color: #4f46e5;
}
.badge--positive {
  background: #ecfdf5;
  color: #059669;
}
.badge--neutral {
  background: #f3f4f6;
  color: #4b5563;
}
</style>
