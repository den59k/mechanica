<template>
  <div class="mech-editor" data-mech-ui>
    <BlockFrame v-if="hovered && hovered.id !== selected?.id" :rect="hovered" variant="hover" />
    <BlockFrame v-if="selected" :rect="selected" variant="selected" :label="selectedName" />

    <div
      v-if="selected"
      class="mech-toolbar"
      :style="{ left: `${selected.left + selected.width}px`, top: `${toolbarTop}px` }"
    >
      <button type="button" title="Move up" @click="store.move(selected.id, -1)">↑</button>
      <button type="button" title="Move down" @click="store.move(selected.id, 1)">↓</button>
      <button type="button" title="Duplicate" @click="store.duplicate(selected.id)">⧉</button>
      <button type="button" title="Delete" @click="store.remove(selected.id)">✕</button>
    </div>

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
import { computed, provide, watch } from 'vue'
import type { State } from '@mechanica/shared'
import { createEditorStore, editorStoreKey } from './store'
import { pushStateUpdate } from './bridge'
import { useBlockFrames } from './use-block-frames'
import type { BlockComponent } from './block-meta'
import type { EditorSnapshot } from './types'
import HierarchyTree from './HierarchyTree.vue'
import BlockPalette from './BlockPalette.vue'
import BlockSettings from './BlockSettings.vue'
import BlockFrame from './BlockFrame.vue'

const props = defineProps<{
  state: State
  components: BlockComponent[]
  onChange?: (snapshot: EditorSnapshot) => void
}>()

const store = createEditorStore(props.state, props.components)
provide(editorStoreKey, store)

const { hovered, selected } = useBlockFrames(store)
const selectedName = computed(() =>
  store.selected ? store.blocksById.get(store.selected.blockId)?.name : '',
)
// Toolbar sits above the block, or just inside it when near the viewport top.
const toolbarTop = computed(() => {
  if (!selected.value) return 0
  return selected.value.top > 36 ? selected.value.top - 32 : selected.value.top + 4
})

// On any edit: push a live preview to the page runtime and report the snapshot.
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
