<template>
  <input
    class="mech-input"
    type="text"
    :value="modelValue"
    :placeholder="schema.placeholder"
    @input="onInput"
  />
</template>

<script setup lang="ts">
defineProps<{ modelValue?: string; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const onInput = (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)
</script>
