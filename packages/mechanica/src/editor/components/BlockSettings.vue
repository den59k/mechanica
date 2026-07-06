<template>
  <div class="mech-settings">
    <template v-if="store.selected">
      <p v-if="translating" class="mech-settings__i18n">
        <VIcon name="globe" />
        <span>Unedited fields inherit <strong>{{ store.defaultLocaleLabel }}</strong>.</span>
      </p>
      <SchemaForm
        v-if="store.selectedSchema"
        :model-value="store.selected.data"
        :schema="store.selectedSchema"
        :base="base"
        :base-label="store.defaultLocaleLabel"
      />
      <p v-else class="mech-settings__empty">This block has no editable settings.</p>
    </template>
    <p v-else class="mech-settings__empty">Select a block to edit its settings.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { editorStoreKey } from '../lib/store'
import SchemaForm from '../props-panel/SchemaForm.vue'
import VIcon from './VIcon.vue'

const store = inject(editorStoreKey)!

// Translation mode: a non-default locale with a default-locale page to inherit from.
const translating = computed(() => !!store.locale && store.locale !== store.defaultLocale)

// The default-locale data for the selected block — drives the per-field
// override markers. Null (no markers) when not editing a translation.
const base = computed(() =>
  translating.value && store.selected ? store.baseDataOf(store.selected.id) : null,
)
</script>

<style lang="scss" scoped>
.mech-settings__i18n {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 7px 9px;
  border-radius: var(--mech-radius-sm, 6px);
  background: var(--mech-accent-soft, rgba(59, 130, 246, 0.09));
  color: var(--mech-muted);
  font-size: 11.5px;
  line-height: 1.35;

  .vicon {
    flex: none;
    width: 13px;
    height: 13px;
    color: var(--mech-accent, #3b82f6);
  }
  strong {
    color: var(--mech-fg);
    font-weight: 600;
  }
}
</style>
