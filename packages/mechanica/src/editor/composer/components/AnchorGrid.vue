<template>
  <div class="mech-composer__anchorgrid" role="group" aria-label="Anchor point">
    <button
      v-for="cell in CELLS"
      :key="cell.anchor"
      type="button"
      class="mech-composer__anchorcell"
      :class="{ 'is-active': cell.anchor === modelValue }"
      :title="cell.title"
      :aria-label="cell.title"
      :aria-pressed="cell.anchor === modelValue"
      @click="emit('update:modelValue', cell.anchor)"
    >
      <span class="mech-composer__anchordot" />
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// Reading order matches the 3×3 grid: pick the point the element pins to. The
// four edge-centres and the middle are new anchors the redesign added.
const CELLS = [
  { anchor: 'top-left', title: 'Top left' },
  { anchor: 'top', title: 'Top center' },
  { anchor: 'top-right', title: 'Top right' },
  { anchor: 'left', title: 'Middle left' },
  { anchor: 'center', title: 'Center' },
  { anchor: 'right', title: 'Middle right' },
  { anchor: 'bottom-left', title: 'Bottom left' },
  { anchor: 'bottom', title: 'Bottom center' },
  { anchor: 'bottom-right', title: 'Bottom right' },
] as const
</script>
