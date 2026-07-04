<template>
  <div class="mech-composer__num2" :class="{ 'is-focus': focused }">
    <VIcon v-if="icon" :name="icon" class="mech-composer__num2-icon" />
    <span v-else-if="label" class="mech-composer__num2-label">{{ label }}</span>
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
</script>
