<template>
  <div class="mech-color">
    <input type="color" :value="modelValue || '#000000'" @input="onInput" />
    <input class="mech-input" type="text" :value="modelValue" placeholder="#000000" @input="onInput" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue?: string; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const onInput = (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)
</script>
