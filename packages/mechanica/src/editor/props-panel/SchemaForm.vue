<template>
  <div class="mech-form">
    <SchemaField
      v-for="(propSchema, key) in properties"
      :key="key"
      :model="modelValue"
      :prop="key"
      :schema="propSchema"
      :label="propSchema.label ?? humanize(String(key))"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SchemaField from './SchemaField.vue'
import { humanize } from './humanize'

const props = defineProps<{ modelValue: Record<string, any>; schema: Record<string, any> }>()
const properties = computed<Record<string, any>>(() => props.schema.properties ?? {})
</script>
