<template>
  <div ref="rootEl" class="mech-select" :class="{ 'is-open': open, 'mech-select--compact': compact }">
    <button
      type="button"
      class="mech-select__trigger"
      :class="[compact ? 'mech-select__trigger--compact' : 'mech-input', { 'is-placeholder': !hasValue }]"
      :disabled="disabled"
      :title="title"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown.down.prevent="open ? move(1) : openMenu()"
      @keydown.up.prevent="open ? move(-1) : openMenu()"
      @keydown.enter.prevent="open && active >= 0 ? choose(options[active]!) : openMenu()"
      @keydown.esc="close()"
    >
      <span class="mech-select__value">{{ hasValue ? selectedLabel : placeholder }}</span>
      <VIcon name="chevron-down" class="mech-select__chevron" />
    </button>

    <VPopover :open="open" :anchor="rootEl" :match-width="!compact && !$slots['option-hint']" panel-class="mech-select__menu" @update:open="open = $event">
      <div class="mech-select__body" :class="{ 'has-hint': !!$slots['option-hint'] }">
        <!-- Optional per-option preview column (e.g. a class's CSS declarations),
             rendered once for the active option — so a hover previews it. Sits to
             the LEFT of the list, so the list stays under the trigger and the
             preview extends toward the canvas. -->
        <div v-if="$slots['option-hint']" class="mech-select__hint">
          <slot name="option-hint" :option="active >= 0 ? options[active] ?? null : null" />
        </div>
        <div role="listbox" class="mech-select__list">
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
            <span class="mech-select__option-label">{{ option.label }}</span>
            <VIcon v-if="isSelected(option)" name="check" class="mech-select__check" />
          </button>
        </div>
      </div>
    </VPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import VIcon from './VIcon.vue'
import VPopover from './VPopover.vue'

export interface SelectOption {
  value: unknown
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: unknown
    options: SelectOption[]
    placeholder?: string
    /** Compact toolbar variant: shorter, fit-to-content trigger. */
    compact?: boolean
    disabled?: boolean
    title?: string
    ariaLabel?: string
  }>(),
  { placeholder: 'Select…', compact: false, disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const isSelected = (option: SelectOption) => option.value === props.modelValue
const selected = computed(() => props.options.find(isSelected))
const hasValue = computed(() => selected.value !== undefined)
const selectedLabel = computed(() => selected.value?.label ?? '')

const rootEl = ref<HTMLElement | null>(null)
const active = ref(-1)
const open = ref(false)

function openMenu() {
  if (!props.options.length || props.disabled) return
  active.value = props.options.findIndex(isSelected)
  open.value = true
}
const close = () => (open.value = false)
const toggle = () => (open.value ? close() : openMenu())
const move = (delta: number) => {
  if (!props.options.length) return
  active.value = (active.value + delta + props.options.length) % props.options.length
}
const choose = (option: SelectOption) => {
  emit('update:modelValue', option.value)
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
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.mech-select.is-open .mech-input.mech-select__trigger {
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

// Compact toolbar trigger: fit-to-content, soft-well hover, no full border.
.mech-select__trigger--compact {
  height: 28px;
  min-width: 96px;
  padding: 0 6px 0 10px;
  border: 1px solid transparent;
  border-radius: var(--mech-radius-sm);
  background: none;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mech-fg-alt);

  .mech-select__chevron {
    width: 14px;
    height: 14px;
  }
  &:hover:not(:disabled) {
    background: var(--mech-field-bg);
    color: var(--mech-fg);
  }
}
.mech-select--compact.is-open .mech-select__trigger--compact {
  background: var(--mech-field-bg);
  color: var(--mech-fg);
}

// Two-column layout when an option-hint preview is provided: the list, then a
// preview pane (VPopover clamps the wider panel back into the viewport).
.mech-select__body {
  display: flex;
  align-items: stretch;
}
.mech-select__body.has-hint .mech-select__hint {
  border-right: 1px solid var(--mech-border);
  padding-right: 4px;
}
.mech-select__body.has-hint .mech-select__list {
  padding-left: 4px;
}
.mech-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 160px;
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
.mech-select--compact .mech-select__option {
  height: 32px;
  font-size: 13px;
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
