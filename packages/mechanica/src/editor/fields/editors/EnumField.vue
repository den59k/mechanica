<template>
  <VSelect
    :model-value="modelValue"
    :options="options"
    :placeholder="placeholder"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VSelect, { type SelectOption } from '../../components/VSelect.vue'

const props = defineProps<{ modelValue?: unknown; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const enumValues = computed<unknown[]>(() => (Array.isArray(props.schema.enum) ? props.schema.enum : []))
const placeholder = computed<string>(() => props.schema.placeholder ?? 'Select…')

// Optional value→label map: `enumLabels` (parallel to `enum`) or an `options`
// array of { value, label }. Otherwise the raw value is shown.
const labels = computed<Map<unknown, string>>(() => {
  const map = new Map<unknown, string>()
  const { enumLabels, options: opts } = props.schema
  if (Array.isArray(enumLabels)) enumValues.value.forEach((v, i) => map.set(v, String(enumLabels[i] ?? v)))
  if (Array.isArray(opts)) for (const o of opts) if (o && 'value' in o) map.set(o.value, String(o.label ?? o.value))
  return map
})

const options = computed<SelectOption[]>(() =>
  enumValues.value.map((value) => ({ value, label: labels.value.get(value) ?? String(value) })),
)
</script>
