<template>
  <div class="mech-composer__num2" :class="{ 'is-focus': focused, 'is-scrubbing': scrubbing }">
    <VIcon
      v-if="icon"
      :name="icon"
      class="mech-composer__num2-icon mech-composer__num2-scrub"
      @pointerdown="onScrubDown"
    />
    <span v-else-if="label" class="mech-composer__num2-label mech-composer__num2-scrub" @pointerdown="onScrubDown">{{
      label
    }}</span>
    <input
      ref="inputEl"
      type="text"
      inputmode="decimal"
      class="mech-composer__num2-field"
      :value="display"
      :placeholder="placeholder ?? ''"
      :aria-label="ariaLabel ?? label"
      @focus="onFocus"
      @blur="focused = false"
      @input="onInput"
      @keydown="onKey"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import VIcon from '../../components/VIcon.vue'
import { scrubValue } from '../lib/scrub'

const props = defineProps<{
  modelValue: number | '' | undefined
  /** Icon prefix (VIcon name) — or a short text `label` when no icon. */
  icon?: string
  label?: string
  ariaLabel?: string
  /** Shown when the value is empty (e.g. a measured/inherited size in grey). */
  placeholder?: string
  min?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | undefined] }>()

const inputEl = ref<HTMLInputElement>()
const focused = ref(false)
const scrubbing = ref(false)

const display = computed(() => (typeof props.modelValue === 'number' ? String(props.modelValue) : ''))

const clamp = (n: number) => (props.min != null ? Math.max(props.min, n) : n)

function commit(n: number | undefined) {
  emit('update:modelValue', n === undefined ? undefined : clamp(n))
}

function onFocus() {
  focused.value = true
  inputEl.value?.select()
}
function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  if (raw === '') return commit(undefined)
  const n = Number(raw)
  if (!Number.isNaN(n)) commit(n)
}
function onKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1)
  const base = typeof props.modelValue === 'number' ? props.modelValue : 0
  commit(base + step)
}

// ── Drag-to-scrub: drag the label/icon left↔right to change the value ──────────
/** Where a scrub starts: the current value, else a numeric placeholder (measured px), else 0. */
function scrubBase(): number {
  if (typeof props.modelValue === 'number') return props.modelValue
  const p = Number(props.placeholder)
  return props.placeholder && Number.isFinite(p) ? p : 0
}
function onScrubDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const startX = event.clientX
  const base = scrubBase()
  let moved = false
  const onMove = (e: PointerEvent) => {
    const dx = e.clientX - startX
    if (!moved && Math.abs(dx) < 3) return // a small wobble is a click, not a scrub
    moved = true
    scrubbing.value = true
    document.body.style.cursor = 'ew-resize'
    commit(scrubValue(base, dx, e.shiftKey, props.min))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.cursor = ''
    scrubbing.value = false
    if (!moved) inputEl.value?.focus() // a plain click on the label focuses the field
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>
