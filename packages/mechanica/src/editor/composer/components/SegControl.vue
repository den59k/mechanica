<template>
  <div class="mech-composer__seg" role="group">
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      class="mech-composer__seg-btn"
      :class="{ 'is-active': opt.value === modelValue }"
      :title="opt.title ?? opt.label ?? String(opt.value)"
      @click="emit('update:modelValue', opt.value)"
    >
      <VIcon v-if="opt.icon" :name="opt.icon" />
      <span v-else>{{ opt.label ?? opt.value }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import VIcon from '../../components/VIcon.vue'

export interface SegOption {
  value: string | number
  label?: string
  icon?: string
  title?: string
}

defineProps<{ options: SegOption[]; modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>
