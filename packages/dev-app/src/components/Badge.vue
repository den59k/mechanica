<template>
  <span class="badge" :class="`badge--${tone}`">{{ text }}</span>
</template>

<script setup lang="ts">
// A plain design-system component (no defineBlock, no block compiler). It is
// offered to designers in the Block Composer via the components manifest
// (src/composer.ts) — the "enhance developers" path: ship a styled component
// with real props, and designers drop it into their composed blocks.
defineProps<{ text?: string; tone?: 'accent' | 'positive' | 'neutral' }>()
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
