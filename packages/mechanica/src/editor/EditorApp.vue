<template>
  <div class="mech-editor" :class="{ 'is-collapsed': collapsed }" data-mech-ui>
    <PanelToggle
      :collapsed="collapsed"
      :right-panel="store.selected ? 380 : 300"
      @toggle="collapsed = !collapsed"
    />

    <template v-if="!collapsed">
      <BlockFrame v-if="hovered && hovered.id !== selected?.id" :rect="hovered" variant="hover" />
      <BlockFrame v-if="selected" :rect="selected" variant="selected" :label="selectedName" />

      <div
        v-if="selected"
        class="mech-toolbar"
        :style="{ left: `${toolbarLeft}px`, top: `${toolbarTop}px` }"
      >
        <button
          type="button"
          class="mech-icon-button mech-toolbar__grip"
          title="Drag to move"
          @pointerdown="drag.begin({ kind: 'move', id: selected.id, label: selectedName ?? '' }, $event)"
        >
          <VIcon name="grip" />
        </button>
        <button type="button" class="mech-icon-button" title="Move up" @click="store.move(selected.id, -1)"><VIcon name="arrow-up" /></button>
        <button type="button" class="mech-icon-button" title="Move down" @click="store.move(selected.id, 1)"><VIcon name="arrow-down" /></button>
        <button type="button" class="mech-icon-button" title="Duplicate" @click="store.duplicate(selected.id)"><VIcon name="copy" /></button>
        <button type="button" class="mech-icon-button is-danger" title="Delete" @click="store.remove(selected.id)"><VIcon name="trash" /></button>
      </div>

      <div
        v-if="drag.indicator"
        class="mech-drop"
        :class="{ 'mech-drop--inside': drag.indicator.mode === 'inside' }"
        :style="{
          transform: `translate(${drag.indicator.left}px, ${drag.indicator.top}px)`,
          width: `${drag.indicator.width}px`,
          height: drag.indicator.height ? `${drag.indicator.height}px` : undefined,
        }"
      />
      <div
        v-if="drag.payload"
        class="mech-ghost"
        :style="{ transform: `translate(${drag.x + 12}px, ${drag.y + 12}px)` }"
      >
        {{ drag.payload.label }}
      </div>
    </template>

    <Transition name="mech-slide-left">
      <aside v-if="!collapsed" class="mech-editor__panel mech-editor__panel--left">
        <div class="mech-editor__pagerow">
          <PageBar />
          <button
            v-if="store.dataEntries.length"
            type="button"
            class="mech-editor__data"
            title="Edit page data"
            @click="openData"
          >
            <VIcon name="sliders" />
          </button>
        </div>
        <div class="mech-editor__heading">
          <span>Page</span>
          <span class="mech-editor__history">
            <button type="button" class="mech-icon-button" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="history.undo()"><VIcon name="undo" /></button>
            <button type="button" class="mech-icon-button" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="history.redo()"><VIcon name="redo" /></button>
          </span>
        </div>
        <HierarchyTree v-if="store.content.length" />
        <p v-else class="mech-tree__empty">No blocks yet — add one from the right.</p>
      </aside>
    </Transition>

    <Transition name="mech-slide-right">
      <aside v-if="!collapsed" class="mech-editor__panel mech-editor__panel--right">
        <div class="mech-editor__heading"><span>Blocks</span></div>
        <BlockPalette />
      </aside>
    </Transition>

    <Transition name="mech-slide-right">
      <aside
        v-if="!collapsed && store.selected"
        class="mech-editor__panel mech-editor__panel--settings"
      >
        <div class="mech-editor__settings-head">
          <span class="mech-editor__settings-title">{{ selectedName }}</span>
          <button
            type="button"
            class="mech-icon-button"
            title="Close"
            @click="store.select(null)"
          >
            <VIcon name="close" />
          </button>
        </div>
        <BlockSettings />
      </aside>
    </Transition>

    <VDialogHost />
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch, onScopeDispose } from 'vue'
import type { DataEntry, State } from '@mechanica/shared'
import { createEditorStore, editorStoreKey } from './lib/store'
import { createDragController, dragKey } from './lib/drag-controller'
import { createHistory } from './lib/history'
import { resolveShortcut } from './lib/shortcuts'
import { pushStateUpdate } from './lib/bridge'
import { useBlockFrames } from './lib/use-block-frames'
import type { BlockComponent } from './lib/block-meta'
import type { EditorSnapshot } from './lib/types'
import { createDialogStore, dialogKey } from './ui/dialog'
import VDialogHost from './ui/VDialogHost.vue'
import DataDialog from './dialogs/DataDialog.vue'
import HierarchyTree from './components/HierarchyTree.vue'
import BlockPalette from './components/BlockPalette.vue'
import BlockSettings from './components/BlockSettings.vue'
import BlockFrame from './components/BlockFrame.vue'
import PageBar from './components/PageBar.vue'
import PanelToggle from './components/PanelToggle.vue'
import VIcon from './components/VIcon.vue'

const props = defineProps<{
  state: State
  components: BlockComponent[]
  dataEntries?: DataEntry[]
  /** Persist a picked file and return its public src; enables image-field uploads. */
  uploadFile?: (file: File) => Promise<{ src: string; previewSrc?: string }>
  /** List images already uploaded to the project, for the reuse-an-image picker. */
  listImages?: () => Promise<{ id: string; name: string; src: string }[]>
  onChange?: (snapshot: EditorSnapshot) => void
}>()

const store = createEditorStore(props.state, props.components, props.dataEntries)
provide(editorStoreKey, store)

// Image fields look these up: the uploader powers new uploads, the library lets
// the picker reuse files already in the project. Null disables each feature.
provide('mechFileUploader', props.uploadFile ?? null)
provide('mechImageLibrary', props.listImages ?? null)

const drag = createDragController(store)
provide(dragKey, drag)

const dialog = createDialogStore()
provide(dialogKey, dialog)
const openData = () => dialog.open(DataDialog)

const history = createHistory(store)
const { canUndo, canRedo } = history

const onKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  const typing =
    !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

  // Space hides/reveals the panels — but only when it isn't being typed into a
  // field, "used" by a focused control (button, link, …), or while a dialog is up.
  if ((event.key === ' ' || event.code === 'Space') && !typing && dialog.stack.length === 0) {
    const active = document.activeElement as HTMLElement | null
    const usesSpace =
      !!active &&
      active !== document.body &&
      !!active.closest('button, a, select, input, textarea, [contenteditable], [role="button"], [tabindex]')
    if (!usesSpace) {
      event.preventDefault()
      collapsed.value = !collapsed.value
      return
    }
  }

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
  else if (action === 'paste') store.paste(store.selectedId)
  else if (store.selectedId) {
    if (action === 'delete') store.remove(store.selectedId)
    else if (action === 'duplicate') store.duplicate(store.selectedId)
    else if (action === 'copy') store.copy(store.selectedId)
    else if (action === 'cut') store.cut(store.selectedId)
  }
}
document.addEventListener('keydown', onKeyDown)
onScopeDispose(() => {
  document.removeEventListener('keydown', onKeyDown)
  history.dispose()
})

const collapsed = ref(false)
const { hovered, selected } = useBlockFrames(store)

const selectedName = computed(() =>
  store.selected ? store.blocksById.get(store.selected.blockId)?.name : '',
)
// Toolbar sits above the block, or just inside it when near the viewport top.
const toolbarTop = computed(() => {
  if (!selected.value) return 0
  return selected.value.top > 36 ? selected.value.top - 32 : selected.value.top + 4
})
// Anchor the toolbar at the block's right edge, but keep it clear of the panel
// that overlays the page on the right — the settings panel (--mech-settings-width,
// 380px) is open whenever a block is selected.
const toolbarLeft = computed(() => {
  if (!selected.value) return 0
  return Math.min(selected.value.left + selected.value.width, window.innerWidth - 380)
})

// On any edit: push the effective data as a live preview to the runtime, and
// report the snapshot (split into scope buckets) for the dev server to persist.
watch(
  () => [store.content, store.siteData, store.folderData, store.pageData],
  () => {
    const snapshot: EditorSnapshot = store.snapshot() as EditorSnapshot
    pushStateUpdate({ content: snapshot.content as never, data: clone(store.effective) })
    props.onChange?.(snapshot)
  },
  { deep: true },
)

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
</script>
