<template>
  <div class="mech-field">
    <label v-if="label && schema.type !== 'boolean'" class="mech-field__label">{{ label }}</label>
    <component
      :is="editor"
      :model-value="modelValue"
      :schema="schema"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p v-if="schema.description" class="mech-field__hint">{{ schema.description }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { resolveFieldEditor } from './registry'

const props = defineProps<{ modelValue: unknown; schema: Record<string, any>; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const editor = computed(() => resolveFieldEditor(props.schema))
const label = computed(() => props.label ?? props.schema.label)
</script>
