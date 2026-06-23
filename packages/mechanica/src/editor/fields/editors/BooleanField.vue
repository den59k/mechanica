<template>
  <label class="mech-checkbox">
    <input type="checkbox" :checked="modelValue" @change="onChange" />
    <span v-if="schema.label">{{ schema.label }}</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue?: boolean; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const onChange = (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked)
</script>
