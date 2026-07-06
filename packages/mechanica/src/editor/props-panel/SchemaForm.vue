<template>
  <div class="mech-form">
    <template v-for="(propSchema, key) in properties" :key="key">
      <!-- Translation editing: wrap each field so an overriding one can be reset
           back to the inherited (default-locale) value. Absent `base` → normal. -->
      <div v-if="base" class="mech-form__row" :class="{ 'is-overridden': isOverridden(key) }">
        <SchemaField
          :model="modelValue"
          :prop="key"
          :schema="propSchema"
          :label="propSchema.label ?? humanize(String(key))"
        />
        <button
          v-if="isOverridden(key)"
          type="button"
          class="mech-form__reset"
          :title="resetTitle"
          @click="reset(key)"
        >
          <VIcon name="undo" />
        </button>
      </div>

      <SchemaField
        v-else
        :model="modelValue"
        :prop="key"
        :schema="propSchema"
        :label="propSchema.label ?? humanize(String(key))"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { deepEqual } from 'mechanica-shared'
import SchemaField from './SchemaField.vue'
import VIcon from '../components/VIcon.vue'
import { humanize } from './humanize'

const props = defineProps<{
  modelValue: Record<string, any>
  schema: Record<string, any>
  /**
   * Default-locale values, set only for the root form of a block while editing a
   * translation. A field whose value differs is an *override*; it gets a reset
   * that restores the inherited value (which the save path then drops from disk).
   */
  base?: Record<string, any> | null
  /** Label of the default locale, for the reset tooltip. */
  baseLabel?: string | null
}>()

const properties = computed<Record<string, any>>(() => props.schema.properties ?? {})
const resetTitle = computed(() => `Reset to ${props.baseLabel || 'default language'}`)

/** A field overrides the default locale when its value differs from the base. */
function isOverridden(key: string | number): boolean {
  return !!props.base && !deepEqual(props.modelValue[key], props.base[key as string])
}

/** Restore the inherited value — equal to base, so the save diff drops it. */
function reset(key: string | number): void {
  if (!props.base) return
  const value = props.base[key as string]
  if (value === undefined) delete props.modelValue[key as string]
  else props.modelValue[key as string] = JSON.parse(JSON.stringify(value))
}
</script>

<style lang="scss" scoped>
.mech-form__row {
  position: relative;
}
// A faint accent bar marks a field that overrides the default language — enough
// to scan for at a glance, quiet enough to ignore.
.mech-form__row.is-overridden::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 2px;
  bottom: 2px;
  width: 2px;
  border-radius: 2px;
  background: var(--mech-accent, #3b82f6);
  opacity: 0.55;
}
.mech-form__reset {
  position: absolute;
  top: -1px;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--mech-muted);
  cursor: pointer;
  opacity: 0.6;
  transition:
    opacity 0.12s,
    color 0.12s,
    background 0.12s;

  &:hover {
    opacity: 1;
    color: var(--mech-accent, #3b82f6);
    background: var(--mech-accent-soft, rgba(59, 130, 246, 0.1));
  }
  .vicon {
    width: 13px;
    height: 13px;
  }
}
</style>
