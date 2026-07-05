<template>
  <!-- Box-model editor: the four side fields sit where they act — top on top,
       left on the left, etc. — around a glyph standing in for the element, so
       the spatial position *is* the label. Used for padding and margin. Holding
       Alt edits a side and its opposite together (top↔bottom, left↔right). -->
  <div class="mech-composer__box" :class="{ 'is-alt': altHeld }">
    <NumInput
      class="mech-composer__box-t"
      scrub
      :model-value="sides.t"
      :min="min"
      :aria-label="`Top ${label}`"
      @update:model-value="setSideVal('t', $event)"
    />
    <NumInput
      class="mech-composer__box-l"
      scrub
      :model-value="sides.l"
      :min="min"
      :aria-label="`Left ${label}`"
      @update:model-value="setSideVal('l', $event)"
    />
    <div class="mech-composer__box-frame"><span class="mech-composer__box-glyph" /></div>
    <NumInput
      class="mech-composer__box-r"
      scrub
      :model-value="sides.r"
      :min="min"
      :aria-label="`Right ${label}`"
      @update:model-value="setSideVal('r', $event)"
    />
    <NumInput
      class="mech-composer__box-b"
      scrub
      :model-value="sides.b"
      :min="min"
      :aria-label="`Bottom ${label}`"
      @update:model-value="setSideVal('b', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

// Alt mirrors an edit to the opposite side (top↔bottom, left↔right), like the
// canvas padding drag. Tracked globally so it applies mid-scrub, on arrow keys,
// and while typing — and drives the `is-alt` preview highlight in CSS.
const altHeld = ref(false)
const syncAlt = (e: KeyboardEvent) => (altHeld.value = e.altKey)
const clearAlt = () => (altHeld.value = false)
onMounted(() => {
  window.addEventListener('keydown', syncAlt)
  window.addEventListener('keyup', syncAlt)
  window.addEventListener('blur', clearAlt)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', syncAlt)
  window.removeEventListener('keyup', syncAlt)
  window.removeEventListener('blur', clearAlt)
})

// setSide collapses back to the shortest form, so all-equal sides stay a single number.
const setSideVal = (side: keyof Sides, n: number | undefined) =>
  emit('update:modelValue', setSide(props.modelValue, side, n ?? 0, altHeld.value))
</script>
