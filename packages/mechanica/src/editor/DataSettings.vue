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
import { editorStoreKey } from './store'
import SchemaForm from './props-panel/SchemaForm.vue'

const store = inject(editorStoreKey)!
</script>
