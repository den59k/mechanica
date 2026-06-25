<template>
  <div class="mech-field">
    <div v-if="label && schema.type !== 'boolean'" class="mech-field__head">
      <label class="mech-field__label">{{ label }}</label>
      <span v-if="kindChip" class="mech-field__chip">{{ kindChip }}</span>
    </div>
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

// Field-type chips shown next to the label so a special field reads as what it
// is at a glance (currently the smartLink combobox).
const FIELD_CHIPS: Record<string, string> = { smartLink: 'SmartLink' }

const editor = computed(() => resolveFieldEditor(props.schema))
const label = computed(() => props.label ?? props.schema.label)
const kindChip = computed(() => (props.schema.format ? FIELD_CHIPS[props.schema.format] : undefined))
</script>
