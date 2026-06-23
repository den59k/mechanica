<template>
  <div class="mech-array">
    <label v-if="label" class="mech-field__label">{{ label }}</label>

    <div v-for="(_, index) in list" :key="index" class="mech-array__item">
      <SchemaForm v-if="itemIsObject" :model-value="list[index]" :schema="schema.items" />
      <FieldControl
        v-else
        :model-value="list[index]"
        :schema="schema.items"
        @update:model-value="list[index] = $event"
      />
      <button type="button" class="mech-array__remove" title="Remove" @click="remove(index)">×</button>
    </div>

    <button type="button" class="mech-array__add" @click="add">+ Add</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getDefaultValue } from '@mechanica/shared'
import SchemaForm from './SchemaForm.vue'
import FieldControl from '../fields/FieldControl.vue'

const props = defineProps<{
  model: Record<string, any>
  prop: string | number
  schema: Record<string, any>
  label?: string
}>()

if (!Array.isArray(props.model[props.prop])) props.model[props.prop] = []

const list = computed<any[]>(() => props.model[props.prop] as any[])
const itemIsObject = computed(
  () => props.schema.items?.type === 'object' && !props.schema.items?.format,
)

const add = () => list.value.push(getDefaultValue(props.schema.items))
const remove = (index: number) => list.value.splice(index, 1)
</script>
