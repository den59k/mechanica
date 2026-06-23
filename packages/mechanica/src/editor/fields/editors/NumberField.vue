<template>
  <input class="mech-input" type="number" :value="modelValue" @input="onInput" />
</template>

<script setup lang="ts">
defineProps<{ modelValue?: number; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()
const onInput = (event: Event) => {
  const raw = (event.target as HTMLInputElement).value
  emit('update:modelValue', raw === '' ? 0 : Number(raw))
}
</script>
