<template>
  <div class="mech-composer__sizeinput">
    <NumInput
      :label="axis === 'w' ? 'W' : 'H'"
      :model-value="fixedValue"
      :placeholder="placeholder"
      :aria-label="`${axis === 'w' ? 'Width' : 'Height'} (px)`"
      :min="0"
      @update:model-value="onNumber"
    />
    <select class="mech-composer__unit" :value="mode" :aria-label="`${axis} sizing`" @change="onMode">
      <option value="hug">Hug</option>
      <option value="fill">Fill</option>
      <option value="fixed">Fixed</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { composerStoreKey } from '../lib/keys'
import NumInput from './NumInput.vue'

const props = defineProps<{ node: ContentBlock; axis: 'w' | 'h' }>()
const store = inject(composerStoreKey)!

const value = computed(() => store.effective(props.node, props.axis))
const mode = computed(() => (typeof value.value === 'number' ? 'fixed' : value.value === 'fill' ? 'fill' : 'hug'))
const fixedValue = computed<number | ''>(() => (typeof value.value === 'number' ? value.value : ''))

// The measured on-canvas size feeds the placeholder in Hug/Fill so a designer
// still sees how big it actually is (populated by the canvas overlay, R4).
const placeholder = computed(() => {
  if (mode.value === 'fixed') return ''
  const m = props.node.id === store.selectedId ? store.measured : null
  const px = m ? (props.axis === 'w' ? m.w : m.h) : null
  return px ? String(px) : mode.value === 'fill' ? 'Fill' : 'Hug'
})

const set = (v: unknown) => store.setData(props.node.id, { [props.axis]: v }, { responsive: true })

function onNumber(n: number | undefined) {
  // Typing a number switches the axis to Fixed; clearing it reverts to Hug.
  set(n === undefined ? undefined : n)
}
function onMode(event: Event) {
  const next = (event.target as HTMLSelectElement).value
  if (next === 'hug') set(undefined)
  else if (next === 'fill') set('fill')
  else set(typeof value.value === 'number' ? value.value : 240)
}
</script>
