<template>
  <!-- Box-model editor: the four side fields sit where they act — top on top,
       left on the left, etc. — around a glyph standing in for the element, so
       the spatial position *is* the label. Used for padding and margin. -->
  <div class="mech-composer__box">
    <NumInput
      class="mech-composer__box-t"
      :model-value="sides.t"
      :min="min"
      :aria-label="`Top ${label}`"
      @update:model-value="setSideVal('t', $event)"
    />
    <NumInput
      class="mech-composer__box-l"
      :model-value="sides.l"
      :min="min"
      :aria-label="`Left ${label}`"
      @update:model-value="setSideVal('l', $event)"
    />
    <div class="mech-composer__box-frame"><span class="mech-composer__box-glyph" /></div>
    <NumInput
      class="mech-composer__box-r"
      :model-value="sides.r"
      :min="min"
      :aria-label="`Right ${label}`"
      @update:model-value="setSideVal('r', $event)"
    />
    <NumInput
      class="mech-composer__box-b"
      :model-value="sides.b"
      :min="min"
      :aria-label="`Bottom ${label}`"
      @update:model-value="setSideVal('b', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NumInput from './NumInput.vue'
import { parsePadding, setSide, type Sides } from '../lib/padding'

const props = defineProps<{
  /** Raw stored value — `number` | `[y, x]` | `[t, r, b, l]` (padding shorthand). */
  modelValue: unknown
  /** `0` for padding; omit for margin, where negatives are allowed. */
  min?: number
  /** Noun for the per-side aria labels ("padding" | "margin"). */
  label?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | number[]] }>()

const sides = computed<Sides>(() => parsePadding(props.modelValue))
// setSide collapses back to the shortest form, so all-equal sides stay a single number.
const setSideVal = (side: keyof Sides, n: number | undefined) =>
  emit('update:modelValue', setSide(props.modelValue, side, n ?? 0))
</script>
