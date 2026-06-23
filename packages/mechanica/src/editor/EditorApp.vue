<template>
  <div class="mech-editor">
    <aside class="mech-editor__panel mech-editor__panel--left">
      <div class="mech-editor__heading">Page</div>
      <HierarchyTree />
    </aside>
    <aside class="mech-editor__panel mech-editor__panel--right">
      <BlockSettings />
      <details class="mech-editor__palette">
        <summary>Add block</summary>
        <BlockPalette />
      </details>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { provide, watch } from 'vue'
import type { State } from '@mechanica/shared'
import { createEditorStore, editorStoreKey } from './store'
import { pushStateUpdate } from './bridge'
import type { BlockComponent } from './block-meta'
import type { EditorSnapshot } from './types'
import HierarchyTree from './HierarchyTree.vue'
import BlockPalette from './BlockPalette.vue'
import BlockSettings from './BlockSettings.vue'

const props = defineProps<{
  state: State
  components: BlockComponent[]
  onChange?: (snapshot: EditorSnapshot) => void
}>()

const store = createEditorStore(props.state, props.components)
provide(editorStoreKey, store)

// On any edit: push a live preview to the page runtime and report the snapshot
// (the entry persists it).
watch(
  () => [store.content, store.data],
  () => {
    const snapshot: EditorSnapshot = {
      content: JSON.parse(JSON.stringify(store.content)),
      data: JSON.parse(JSON.stringify(store.data)),
    }
    pushStateUpdate(snapshot as never)
    props.onChange?.(snapshot)
  },
  { deep: true },
)
</script>
