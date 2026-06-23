<template>
  <div class="mech-frame" :class="`mech-frame--${variant}`" :style="style">
    <span v-if="variant === 'selected' && label" class="mech-frame__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockRect } from '../lib/use-block-frames'

const props = defineProps<{ rect: BlockRect; variant: 'hover' | 'selected'; label?: string }>()

const style = computed(() => ({
  transform: `translate(${props.rect.left}px, ${props.rect.top}px)`,
  width: `${props.rect.width}px`,
  height: `${props.rect.height}px`,
}))
</script>
