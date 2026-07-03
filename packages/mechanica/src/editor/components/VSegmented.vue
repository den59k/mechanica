<template>
  <div class="mech-segmented" :class="`mech-segmented--${size}`" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="mech-segmented__seg"
      :class="{ 'is-active': option.value === modelValue }"
      :aria-selected="option.value === modelValue"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
export interface SegmentedOption {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue?: string
    options: SegmentedOption[]
    /** Visual size: `md` (settings panels) or `sm` (compact toolbars / inline fields). */
    size?: 'sm' | 'md'
    ariaLabel?: string
  }>(),
  { size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<style lang="scss" scoped>
.mech-segmented {
  display: inline-flex;
  gap: 2px;
  background: var(--mech-field-bg);
}
.mech-segmented__seg {
  border: none;
  background: none;
  font: inherit;
  font-weight: 500;
  color: var(--mech-muted);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    box-shadow 0.12s;

  &:hover {
    color: var(--mech-fg);
  }
  &.is-active {
    background: var(--mech-bg);
    color: var(--mech-fg);
  }
}

// Settings-panel size (Data scope switch, …).
.mech-segmented--md {
  padding: 3px;
  border-radius: var(--mech-radius);
}
.mech-segmented--md .mech-segmented__seg {
  padding: 5px 12px;
  border-radius: var(--mech-radius-sm);
  font-size: 12.5px;

  &.is-active {
    box-shadow: var(--mech-shadow-pop);
  }
}

// Compact toolbar / inline-field size (rich-text view toggle).
.mech-segmented--sm {
  padding: 2px;
  border-radius: var(--mech-radius-sm);
}
.mech-segmented--sm .mech-segmented__seg {
  padding: 3px 9px;
  border-radius: calc(var(--mech-radius-sm) - 2px);
  font-size: 11.5px;

  &.is-active {
    box-shadow: 0 1px 2px rgba(20, 23, 28, 0.14);
  }
}
</style>
