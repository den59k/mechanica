<template>
  <div ref="rootEl" class="mech-select" :class="{ 'is-open': open }">
    <button
      type="button"
      class="mech-input mech-select__trigger"
      :class="{ 'is-placeholder': !hasValue }"
      @click="toggle"
      @keydown.down.prevent="open ? move(1) : openMenu()"
      @keydown.up.prevent="open ? move(-1) : openMenu()"
      @keydown.enter.prevent="open && active >= 0 ? choose(options[active]) : openMenu()"
      @keydown.esc="close()"
    >
      <span class="mech-select__value">{{ hasValue ? labelOf(modelValue) : placeholder }}</span>
      <VIcon name="chevron-down" class="mech-select__chevron" />
    </button>

    <VPopover
      :open="open"
      :anchor="rootEl"
      match-width
      panel-class="mech-select__menu"
      @update:open="open = $event"
    >
      <div role="listbox">
        <button
          v-for="(option, index) in options"
          :key="index"
          type="button"
          class="mech-select__option"
          :class="{ 'is-selected': isSelected(option), 'is-active': index === active }"
          role="option"
          :aria-selected="isSelected(option)"
          @click="choose(option)"
          @pointermove="active = index"
        >
          <span class="mech-select__option-label">{{ labelOf(option) }}</span>
          <VIcon v-if="isSelected(option)" name="check" class="mech-select__check" />
        </button>
      </div>
    </VPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import VIcon from '../../components/VIcon.vue'
import VPopover from '../../components/VPopover.vue'

const props = defineProps<{ modelValue?: unknown; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const options = computed<unknown[]>(() => (Array.isArray(props.schema.enum) ? props.schema.enum : []))
const placeholder = computed<string>(() => props.schema.placeholder ?? 'Select…')
const hasValue = computed(
  () => props.modelValue != null && props.modelValue !== '' && options.value.includes(props.modelValue),
)

// Optional value→label map: `enumLabels` (parallel to `enum`) or an `options`
// array of { value, label }. Otherwise the raw value is shown.
const labels = computed<Map<unknown, string>>(() => {
  const map = new Map<unknown, string>()
  const { enumLabels, options: opts } = props.schema
  if (Array.isArray(enumLabels)) options.value.forEach((v, i) => map.set(v, String(enumLabels[i] ?? v)))
  if (Array.isArray(opts)) for (const o of opts) if (o && 'value' in o) map.set(o.value, String(o.label ?? o.value))
  return map
})
const labelOf = (option: unknown) => labels.value.get(option) ?? String(option)
const isSelected = (option: unknown) => option === props.modelValue

const rootEl = ref<HTMLElement | null>(null)
const active = ref(-1)
const open = ref(false)

function openMenu() {
  if (!options.value.length) return
  active.value = options.value.findIndex(isSelected)
  open.value = true
}
const close = () => (open.value = false)
const toggle = () => (open.value ? close() : openMenu())
const move = (delta: number) => {
  if (!options.value.length) return
  active.value = (active.value + delta + options.value.length) % options.value.length
}
const choose = (option: unknown) => {
  emit('update:modelValue', option)
  close()
}
</script>

<style lang="scss" scoped>
.mech-select {
  position: relative;
}
.mech-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;

  &.is-placeholder .mech-select__value {
    color: var(--mech-placeholder);
  }
}
.mech-select.is-open .mech-select__trigger {
  background: var(--mech-bg);
  border-color: var(--mech-accent);
  box-shadow: 0 0 0 3px var(--mech-ring);
}
.mech-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-select__chevron {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--mech-muted);
  transition: transform 0.16s ease;
}
.mech-select.is-open .mech-select__chevron {
  transform: rotate(180deg);
}

.mech-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 8px 0 10px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  font: inherit;
  font-size: 13.5px;
  color: var(--mech-fg);
  text-align: left;
  cursor: pointer;

  &.is-active {
    background: var(--mech-hover);
  }
  &.is-selected {
    font-weight: 500;
  }
}
.mech-select__option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-select__check {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-accent);
}
</style>
