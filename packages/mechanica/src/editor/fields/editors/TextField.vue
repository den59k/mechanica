<template>
  <textarea
    class="mech-input mech-textarea"
    :value="modelValue"
    :placeholder="schema.placeholder"
    rows="3"
    @input="onInput"
  />
</template>

<script setup lang="ts">
defineProps<{ modelValue?: string; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const onInput = (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
</script>
