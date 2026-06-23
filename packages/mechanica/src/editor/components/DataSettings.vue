<template>
  <div class="mech-data">
    <div v-for="entry in store.dataEntries" :key="entry.id" class="mech-data__entry">
      <div class="mech-data__head">
        <span class="mech-data__title">{{ entry.title ?? entry.id }}</span>
        <span class="mech-data__scope">{{ entry.scope ?? 'page' }}</span>
      </div>
      <SchemaForm v-if="entry.props" :model-value="store.dataValue(entry.id)" :schema="entry.props" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { editorStoreKey } from '../lib/store'
import SchemaForm from '../props-panel/SchemaForm.vue'

const store = inject(editorStoreKey)!
</script>

<style lang="scss" scoped>
.mech-data {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.mech-data__entry {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--mech-border);

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}
.mech-data__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mech-data__title {
  font-weight: 600;
  font-size: 13.5px;
}
.mech-data__scope {
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
