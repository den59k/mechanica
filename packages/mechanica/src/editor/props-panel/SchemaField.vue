<template>
  <!-- Plain object → a collapsible group wrapping a nested form. -->
  <VCollapse v-if="isObject" class="mech-group" :title="label">
    <SchemaForm :model-value="model[prop]" :schema="schema" />
  </VCollapse>

  <!-- Array → its own collapsible list (handles primitive vs object items). -->
  <ArrayField v-else-if="isArray" :model="model" :prop="prop" :schema="schema" :label="label" />

  <!-- Leaf control (string, number, image, …). -->
  <FieldControl
    v-else
    :model-value="model[prop]"
    :schema="schema"
    :label="label"
    @update:model-value="model[prop] = $event"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SchemaForm from './SchemaForm.vue'
import ArrayField from './ArrayField.vue'
import VCollapse from './VCollapse.vue'
import FieldControl from '../fields/FieldControl.vue'

const props = defineProps<{
  model: Record<string, any>
  prop: string | number
  schema: Record<string, any>
  label?: string
}>()

// Plain object (no custom format) → recurse; formatted objects (image, …) → FieldControl.
const isObject = computed(
  () => props.schema.type === 'object' && !!props.schema.properties && !props.schema.format,
)
const isArray = computed(() => props.schema.type === 'array' && !props.schema.format)

// Ensure nested objects have a container so the recursive form can bind to it.
if (props.schema.type === 'object' && !props.schema.format) {
  const current = props.model[props.prop]
  if (current == null || typeof current !== 'object') props.model[props.prop] = {}
}
</script>
