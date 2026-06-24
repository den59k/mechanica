<template>
  <div class="mech-data">
    <div v-if="store.dataEntries.length > 1" class="mech-data__tabs" role="tablist">
      <button
        v-for="entry in store.dataEntries"
        :key="entry.id"
        type="button"
        role="tab"
        class="mech-data__tab"
        :class="{ 'is-active': entry.id === activeId }"
        :aria-selected="entry.id === activeId"
        @click="activeId = entry.id"
      >
        {{ entry.title ?? entry.id }}
      </button>
    </div>

    <div v-if="active" class="mech-data__panel">
      <span class="mech-data__scope">{{ active.scope ?? 'page' }} data</span>
      <SchemaForm
        v-if="active.props"
        :key="active.id"
        :model-value="store.dataValue(active.id)"
        :schema="active.props"
      />
    </div>
    <p v-else class="mech-settings__empty">This page has no editable data.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { editorStoreKey } from '../lib/store'
import SchemaForm from '../props-panel/SchemaForm.vue'

const store = inject(editorStoreKey)!

// One tab per defineData entry; default to the first (broadest scope first).
const activeId = ref<string | null>(store.dataEntries[0]?.id ?? null)
const active = computed(
  () => store.dataEntries.find((entry) => entry.id === activeId.value) ?? store.dataEntries[0] ?? null,
)
</script>

<style lang="scss" scoped>
.mech-data {
  display: flex;
  flex-direction: column;
}
.mech-data__tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--mech-border);
}
.mech-data__tab {
  padding: 8px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  color: var(--mech-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.12s;

  &:hover {
    color: var(--mech-fg);
  }
  &.is-active {
    color: var(--mech-fg);
    border-bottom-color: var(--mech-fg);
  }
}
.mech-data__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mech-data__scope {
  align-self: flex-start;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mech-muted);
  background: var(--mech-active);
  border-radius: var(--mech-radius-pill);
  padding: 2px 8px;
}
</style>
