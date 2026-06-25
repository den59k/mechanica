<template>
  <VCollapse class="mech-array" :title="label" :badge="list.length">
    <div ref="itemsEl" class="mech-array__items">
      <template v-for="(_, index) in list" :key="index">
        <!-- Object items are collapsible cards (grip · summary · remove). -->
        <VCollapse
          v-if="itemIsObject"
          class="mech-array__item"
          :class="{ 'is-dragging': dragging === index }"
          :title="summaryOf(index)"
          :default-open="index === justAdded"
        >
          <template #lead>
            <button
              type="button"
              class="mech-array__grip"
              title="Drag to reorder"
              @pointerdown="start(index, $event)"
            >
              <VIcon name="grip" />
            </button>
          </template>
          <template #actions>
            <button type="button" class="mech-array__remove" title="Remove" @click="remove(index)">
              <VIcon name="close" />
            </button>
          </template>
          <SchemaForm :model-value="list[index]" :schema="schema.items" />
        </VCollapse>

        <!-- Primitive items are a single control on a row. -->
        <div v-else class="mech-array__row" :class="{ 'is-dragging': dragging === index }">
          <button
            type="button"
            class="mech-array__grip"
            title="Drag to reorder"
            @pointerdown="start(index, $event)"
          >
            <VIcon name="grip" />
          </button>
          <FieldControl
            :model-value="list[index]"
            :schema="schema.items"
            @update:model-value="list[index] = $event"
          />
          <button type="button" class="mech-array__remove" title="Remove" @click="remove(index)">
            <VIcon name="close" />
          </button>
        </div>
      </template>
    </div>

    <button type="button" class="mech-array__add" @click="add"><VIcon name="plus" /> Add</button>
  </VCollapse>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getDefaultValue } from '@mechanica/shared'
import SchemaForm from './SchemaForm.vue'
import VCollapse from './VCollapse.vue'
import FieldControl from '../fields/FieldControl.vue'
import VIcon from '../components/VIcon.vue'
import { useReorder } from './use-reorder'

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

const itemsEl = ref<HTMLElement | null>(null)
const { dragging, start } = useReorder(() => itemsEl.value, () => list.value)

// The freshly-added item opens expanded (its VCollapse mounts with this index);
// existing items keep whatever open state they already had.
const justAdded = ref(-1)
const add = () => {
  list.value.push(getDefaultValue(props.schema.items))
  justAdded.value = list.value.length - 1
}
const remove = (index: number) => list.value.splice(index, 1)

// Keys most likely to read as a human label for a collapsed object row.
const SUMMARY_KEYS = ['title', 'name', 'label', 'heading', 'text', 'caption', 'question']

/** A short summary for a collapsed object item — a representative field, else "Item N". */
function summaryOf(index: number): string {
  const item = list.value[index] as Record<string, unknown> | undefined
  const itemProps = (props.schema.items?.properties ?? {}) as Record<string, unknown>
  const keys = Object.keys(itemProps)
  const pick =
    SUMMARY_KEYS.find((k) => k in itemProps && typeof item?.[k] === 'string' && (item[k] as string).trim()) ??
    keys.find((k) => typeof item?.[k] === 'string' && (item[k] as string).trim())
  const value = pick ? item?.[pick] : undefined
  return typeof value === 'string' && value.trim() ? value : `Item ${index + 1}`
}
</script>
