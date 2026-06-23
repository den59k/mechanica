<template>
  <div class="mech-editor" :class="{ 'is-collapsed': collapsed }" data-mech-ui>
    <button
      class="mech-editor__toggle"
      type="button"
      :title="collapsed ? 'Open editor' : 'Hide editor'"
      @click="collapsed = !collapsed"
    >
      {{ collapsed ? '☰' : '✕' }}
    </button>

    <template v-if="!collapsed">
      <BlockFrame v-if="hovered && hovered.id !== selected?.id" :rect="hovered" variant="hover" />
      <BlockFrame v-if="selected" :rect="selected" variant="selected" :label="selectedName" />

      <div
        v-if="selected"
        class="mech-toolbar"
        :style="{ left: `${selected.left + selected.width}px`, top: `${toolbarTop}px` }"
      >
        <button
          type="button"
          class="mech-toolbar__grip"
          title="Drag to move"
          @pointerdown="drag.begin({ kind: 'move', id: selected.id, label: selectedName ?? '' }, $event)"
        >
          ⠿
        </button>
        <button type="button" title="Move up" @click="store.move(selected.id, -1)">↑</button>
        <button type="button" title="Move down" @click="store.move(selected.id, 1)">↓</button>
        <button type="button" title="Duplicate" @click="store.duplicate(selected.id)">⧉</button>
        <button type="button" title="Delete" @click="store.remove(selected.id)">✕</button>
      </div>

      <div
        v-if="drag.indicator"
        class="mech-drop"
        :style="{
          transform: `translate(${drag.indicator.left}px, ${drag.indicator.top}px)`,
          width: `${drag.indicator.width}px`,
        }"
      />
      <div
        v-if="drag.payload"
        class="mech-ghost"
        :style="{ transform: `translate(${drag.x + 12}px, ${drag.y + 12}px)` }"
      >
        {{ drag.payload.label }}
      </div>

      <aside class="mech-editor__panel mech-editor__panel--left">
        <div class="mech-editor__heading">
          <span>Page</span>
          <span class="mech-editor__history">
            <button type="button" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="history.undo()">↶</button>
            <button type="button" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="history.redo()">↷</button>
          </span>
        </div>
        <HierarchyTree v-if="store.content.length" />
        <p v-else class="mech-tree__empty">No blocks yet — add one from the right.</p>
      </aside>

      <aside class="mech-editor__panel mech-editor__panel--right">
        <div class="mech-tabs">
          <button type="button" :class="{ 'is-active': tab === 'settings' }" @click="tab = 'settings'">
            Settings
          </button>
          <button type="button" :class="{ 'is-active': tab === 'blocks' }" @click="tab = 'blocks'">
            Blocks
          </button>
        </div>
        <BlockSettings v-show="tab === 'settings'" />
        <BlockPalette v-show="tab === 'blocks'" />
      </aside>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch, watchEffect, onScopeDispose } from 'vue'
import type { State } from '@mechanica/shared'
import { createEditorStore, editorStoreKey } from './store'
import { createDragController, dragKey } from './drag-controller'
import { createHistory } from './history'
import { resolveShortcut } from './shortcuts'
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

const drag = createDragController(store)
provide(dragKey, drag)

const history = createHistory(store)
const { canUndo, canRedo } = history

const onKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  const typing =
    !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  const action = resolveShortcut({
    key: event.key,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    typing,
    hasSelection: !!store.selectedId,
  })
  if (!action) return
  if (action !== 'deselect') event.preventDefault()

  if (action === 'undo') history.undo()
  else if (action === 'redo') history.redo()
  else if (action === 'deselect') store.select(null)
  else if (action === 'delete' && store.selectedId) store.remove(store.selectedId)
  else if (action === 'duplicate' && store.selectedId) store.duplicate(store.selectedId)
}
document.addEventListener('keydown', onKeyDown)
onScopeDispose(() => {
  document.removeEventListener('keydown', onKeyDown)
  history.dispose()
})

const collapsed = ref(false)
const tab = ref<'settings' | 'blocks'>('blocks')
const { hovered, selected } = useBlockFrames(store)

// Show the settings tab automatically when a block is selected.
watch(
  () => store.selectedId,
  (id) => {
    if (id) tab.value = 'settings'
  },
)

const selectedName = computed(() =>
  store.selected ? store.blocksById.get(store.selected.blockId)?.name : '',
)
// Toolbar sits above the block, or just inside it when near the viewport top.
const toolbarTop = computed(() => {
  if (!selected.value) return 0
  return selected.value.top > 36 ? selected.value.top - 32 : selected.value.top + 4
})

// Inset the page between the panels only while the editor is open.
watchEffect(() => document.body.classList.toggle('mech-editing', !collapsed.value))
onScopeDispose(() => document.body.classList.remove('mech-editing'))

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
