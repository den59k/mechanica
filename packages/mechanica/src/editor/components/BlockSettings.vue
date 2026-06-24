<template>
  <div class="mech-settings">
    <template v-if="store.selected">
      <SchemaForm
        v-if="store.selectedSchema"
        :model-value="store.selected.data"
        :schema="store.selectedSchema"
      />
      <p v-else class="mech-settings__empty">This block has no editable settings.</p>
    </template>
    <p v-else class="mech-settings__empty">Select a block to edit its settings.</p>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { editorStoreKey } from '../lib/store'
import SchemaForm from '../props-panel/SchemaForm.vue'

const store = inject(editorStoreKey)!
</script>
