<template>
  <div class="mech-settings">
    <template v-if="store.selected">
      <div class="mech-settings__title">{{ name }}</div>
      <SchemaForm
        v-if="store.selectedSchema"
        :model-value="store.selected.data"
        :schema="store.selectedSchema"
      />
    </template>
    <p v-else class="mech-settings__empty">Select a block to edit its settings.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { editorStoreKey } from './store'
import SchemaForm from './props-panel/SchemaForm.vue'

const store = inject(editorStoreKey)!
const name = computed(() =>
  store.selected ? store.blocksById.get(store.selected.blockId)?.name ?? store.selected.blockId : '',
)
</script>
