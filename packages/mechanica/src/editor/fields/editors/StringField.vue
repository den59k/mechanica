<template>
  <TypographyInput
    :model-value="modelValue"
    :placeholder="schema.placeholder"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import TypographyInput from '../../components/TypographyInput.vue'
defineProps<{ modelValue?: string; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>
