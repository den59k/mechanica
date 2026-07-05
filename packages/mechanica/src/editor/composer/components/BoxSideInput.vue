<template>
  <!-- Box-model editor: the four side fields sit where they act — top on top,
       left on the left, etc. — around a glyph standing in for the element, so
       the spatial position *is* the label. Used for padding and margin. Holding
       Alt edits a side and its opposite together (top↔bottom, left↔right). -->
  <div
    class="mech-composer__box"
    :class="{ 'is-alt': altHeld }"
    @pointermove="onMove"
    @pointerleave="onLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @pointerdown="onDown"
  >
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
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NumInput from './NumInput.vue'
import { parsePadding, setSide, type Sides } from '../lib/padding'
import { composerStoreKey } from '../lib/keys'

const props = defineProps<{
  /** Raw stored value — `number` | `[y, x]` | `[t, r, b, l]` (padding shorthand). */
  modelValue: unknown
  /** `0` for padding; omit for margin, where negatives are allowed. */
  min?: number
  /** Noun for the per-side aria labels ("padding" | "margin"). */
  label?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | number[]] }>()

// Nullable so the component still mounts in isolation (unit tests) with no store.
const store = inject(composerStoreKey, null)

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

// setSide collapses back to the shortest form, so all-equal sides stay a single number.
const setSideVal = (side: keyof Sides, n: number | undefined) =>
  emit('update:modelValue', setSide(props.modelValue, side, n ?? 0, altHeld.value))

// ── Canvas echo ──────────────────────────────────────────────────────────────
// Report which side is being hovered/edited so the overlay can light it up on the
// element (padding blue, margin orange). `label` is the spacing noun.
type Side = keyof Sides
const prop = computed<'padding' | 'margin'>(() => (props.label === 'margin' ? 'margin' : 'padding'))
const SIDE_CLASSES: Record<Side, string> = {
  t: 'mech-composer__box-t',
  r: 'mech-composer__box-r',
  b: 'mech-composer__box-b',
  l: 'mech-composer__box-l',
}
const hoverSide = ref<Side | null>(null)
const focusSide = ref<Side | null>(null)
const scrubSide = ref<Side | null>(null) // held for the whole drag, even if the pointer strays
const activeSide = computed<Side | null>(() => scrubSide.value ?? focusSide.value ?? hoverSide.value)

function sideOf(e: Event): Side | null {
  const el = (e.target as HTMLElement | null)?.closest('.mech-composer__num2')
  if (!el) return null
  for (const s of ['t', 'r', 'b', 'l'] as Side[]) if (el.classList.contains(SIDE_CLASSES[s])) return s
  return null
}
const onMove = (e: PointerEvent) => (hoverSide.value = sideOf(e))
const onLeave = () => (hoverSide.value = null)
const onFocusIn = (e: FocusEvent) => (focusSide.value = sideOf(e))
const onFocusOut = () => (focusSide.value = null)
function onDown(e: PointerEvent) {
  const side = sideOf(e)
  if (!side) return
  scrubSide.value = side
  const up = () => {
    scrubSide.value = null
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointerup', up)
}

// Publish to the store; only clear the signal if it's still ours (both the padding
// and margin boxes can be mounted — don't stomp the other's highlight).
watch(activeSide, (s) => {
  if (!store) return
  if (s) store.spacing = { prop: prop.value, side: s }
  else if (store.spacing?.prop === prop.value) store.spacing = null
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', syncAlt)
  window.removeEventListener('keyup', syncAlt)
  window.removeEventListener('blur', clearAlt)
  if (store && store.spacing?.prop === prop.value) store.spacing = null
})
</script>
