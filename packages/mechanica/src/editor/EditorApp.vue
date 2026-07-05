<template>
  <div class="mech-editor" :class="{ 'is-collapsed': collapsed }" data-mech-ui>
    <PanelToggle
      :collapsed="collapsed"
      :right-panel="store.selected ? 380 : 300"
      @toggle="collapsed = !collapsed"
    />

    <template v-if="!collapsed">
      <BlockFrame
        v-if="hovered && hovered.id !== selected?.id && !drag.payload"
        :rect="hovered"
        variant="hover"
      />
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
        <button type="button" class="mech-icon-button" title="Save as a reusable block" @click="saveAsBlock"><VIcon name="frame" /></button>
        <button type="button" class="mech-icon-button is-danger" title="Delete" @click="store.remove(selected.id)"><VIcon name="trash" /></button>
      </div>

      <div
        v-if="drag.domBox"
        class="mech-drop mech-drop--box"
        :class="{ 'mech-drop--outline': drag.domBox.outline }"
        :style="{
          transform: `translate(${drag.domBox.left}px, ${drag.domBox.top}px)`,
          width: `${drag.domBox.width}px`,
          height: `${drag.domBox.height}px`,
        }"
      >
        <span v-if="drag.domBox.label" class="mech-drop__label">{{ drag.domBox.label }}</span>
      </div>
      <div
        v-if="drag.domLine"
        class="mech-drop"
        :style="{
          transform: `translate(${drag.domLine.left}px, ${drag.domLine.top}px)`,
          width: `${drag.domLine.width}px`,
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
        <PageBar />
        <LocaleSwitcher />

        <div class="mech-editor__toolbar">
          <button
            v-if="store.dataEntries.length"
            type="button"
            class="mech-editor__data"
            title="Edit this page's data"
            @click="openData"
          >
            <VIcon name="sliders" />
            <span>Page data</span>
          </button>
          <span class="mech-editor__toolbar-gap" />
          <button
            v-if="save && save.status === 'error'"
            type="button"
            class="mech-editor__save is-error"
            title="Saving to the dev server failed — click to retry"
            @click="save.retry()"
          >
            Save failed · Retry
          </button>
          <template v-else-if="save && save.status === 'conflict'">
            <span class="mech-editor__save is-error" title="This page was edited outside the editor while you had unsaved changes">
              Changed on disk
            </span>
            <button
              type="button"
              class="mech-editor__save is-action"
              title="Drop your unsaved edits and load the page from disk"
              @click="save.reloadFromDisk?.()"
            >
              Reload
            </button>
            <button
              type="button"
              class="mech-editor__save is-action"
              title="Overwrite the on-disk page with your edits"
              @click="save.keepMine?.()"
            >
              Keep mine
            </button>
          </template>
          <span v-else-if="save && save.status !== 'saved'" class="mech-editor__save">Saving…</span>
          <button type="button" class="mech-icon-button" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="history.undo()"><VIcon name="undo" /></button>
          <button type="button" class="mech-icon-button" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="history.redo()"><VIcon name="redo" /></button>
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
    <VContextMenu />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, ref, watch, onScopeDispose, type ShallowRef } from 'vue'
import type { DataEntry, State } from 'mechanica-shared'
import { createEditorStore, editorStoreKey } from './lib/store'
import { cloneBlock } from './lib/content-tree'
import { createDragController, dragKey } from './lib/drag-controller'
import { createHistory } from './lib/history'
import { resolveShortcut } from './lib/shortcuts'
import { pushStateUpdate } from './lib/bridge'
import { useBlockFrames } from './lib/use-block-frames'
import type { BlockComponent } from './lib/block-meta'
import type { EditorSnapshot, SaveController } from './lib/types'
import { navigationKey, fallbackNavigation, type PageNavigation } from './lib/navigation'
import { createDialogStore, dialogKey } from './ui/dialog'
import { createContextMenu, contextMenuKey } from './lib/context-menu'
import VDialogHost from './ui/VDialogHost.vue'
import VContextMenu from './components/VContextMenu.vue'
import DataDialog from './dialogs/DataDialog.vue'
import QuickSwitcher from './dialogs/QuickSwitcher.vue'
import HierarchyTree from './components/HierarchyTree.vue'
import BlockPalette from './components/BlockPalette.vue'
import BlockSettings from './components/BlockSettings.vue'
import BlockFrame from './components/BlockFrame.vue'
import PageBar from './components/PageBar.vue'
import LocaleSwitcher from './components/LocaleSwitcher.vue'
import PanelToggle from './components/PanelToggle.vue'
import VIcon from './components/VIcon.vue'

const props = defineProps<{
  state: State
  components: BlockComponent[]
  dataEntries?: DataEntry[]
  /** Persist a picked file and return its public src (plus dimensions + LQIP
   *  previewSrc when the backend can produce them); enables image uploads. */
  uploadFile?: (file: File) => Promise<{ src: string; previewSrc?: string; width?: number; height?: number }>
  /** Persist a cropped derivative under a caller-chosen name; enables the crop dialog. */
  uploadDerived?: (blob: Blob, name: string) => Promise<{ src: string }>
  /** List images already uploaded to the project, for the reuse-an-image picker. */
  listImages?: () => Promise<{ id: string; name: string; src: string }[]>
  onChange?: (snapshot: EditorSnapshot) => void
  /** Live save status + actions (retry / conflict resolution), surfaced in the toolbar. */
  save?: SaveController
  /** Fresh state pushed when the page changes on disk (external edit, editor clean). */
  externalState?: ShallowRef<State | null>
  /** In-place page switching (current path + switchPage), provided to dialogs. */
  navigation?: PageNavigation
}>()

const store = createEditorStore(props.state, props.components, props.dataEntries)
provide(editorStoreKey, store)

// Image fields look these up: the uploader powers new uploads, the library lets
// the picker reuse files already in the project, and the derived uploader stores
// cropped derivatives. Null disables each feature.
provide('mechFileUploader', props.uploadFile ?? null)
provide('mechDerivedUploader', props.uploadDerived ?? null)
provide('mechImageLibrary', props.listImages ?? null)

const drag = createDragController(store)
provide(dragKey, drag)

const dialog = createDialogStore()
provide(dialogKey, dialog)
const openData = () => dialog.open(DataDialog)

const navigation = props.navigation ?? fallbackNavigation()
provide(navigationKey, navigation)

const contextMenu = createContextMenu()
provide(contextMenuKey, contextMenu)

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
    code: event.code,
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
  else if (action === 'quickSwitch') {
    // Toggle: Cmd/Ctrl+K closes the switcher it opened; other dialogs keep focus.
    const top = dialog.stack[dialog.stack.length - 1]
    if (top?.component === QuickSwitcher) dialog.back()
    else if (dialog.stack.length === 0) dialog.open(QuickSwitcher)
  } else if (action === 'deselect') store.select(null)
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

// Turn the selected block (and its children) into a reusable composed block —
// the "create component from selection" moment. It's saved to `.mech/blocks`
// and appears in the palette after the reload. Composed blocks can't be nested
// in v1, so a composed selection is refused.
async function saveAsBlock(): Promise<void> {
  const sel = store.selected
  if (!sel) return
  const meta = store.blocksById.get(sel.blockId)
  if (meta?.composed) {
    window.alert('This is already a composed block — nest-in-composed is not supported yet.')
    return
  }
  const name = window.prompt('Save this as a reusable block. Name:', meta?.name ?? 'My block')
  if (!name?.trim()) return
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'block'
  const def = { id, name: name.trim(), template: [cloneBlock(sel)] }
  const res = await fetch('/@mechanica/composed/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(def),
  })
  if (res.ok) {
    window.location.reload() // refresh the palette + runtime with the new block
  } else {
    const err = (await res.json().catch(() => null)) as { error?: { id?: string } | string } | null
    const message = typeof err?.error === 'object' ? err?.error?.id : err?.error
    window.alert(`Could not save block: ${message ?? res.status}`)
  }
}

const collapsed = ref(false)
// Links clicked on the live page follow through the in-place page switch, so
// the editor (save path, page version, undo history) moves with the page.
const { hovered, selected } = useBlockFrames(store, {
  followLink: (path) => void navigation.switchPage(path),
})

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
// 380px) is open whenever a block is selected. clientWidth, not innerWidth: the
// fixed panel sits left of the scrollbar, which innerWidth includes — that was
// pushing the toolbar under the panel. The 12px keeps a visible gap besides.
const TOOLBAR_PANEL_GAP = 380 + 12
const toolbarLeft = computed(() => {
  if (!selected.value) return 0
  const limit = document.documentElement.clientWidth - TOOLBAR_PANEL_GAP
  return Math.min(selected.value.left + selected.value.width, limit)
})

// On any edit: push the effective data as a live preview to the runtime, and
// report the snapshot (split into scope buckets) for the dev server to persist.
// Suppressed while applying an external (on-disk) change — that state came
// *from* the server, echoing it back as a save would be noise.
let applyingExternal = false
watch(
  () => [store.content, store.siteData, store.folderData, store.pageData],
  () => {
    if (applyingExternal) return
    const snapshot: EditorSnapshot = store.snapshot() as EditorSnapshot
    pushStateUpdate({ content: snapshot.content as never, data: clone(store.effective) })
    props.onChange?.(snapshot)
  },
  { deep: true },
)

// The page changed on disk while the editor was clean (live sync with e.g.
// Claude editing the .page.md), or the user switched pages in place: apply the
// fresh state, push it to the runtime, and keep it undoable through history.
let currentPagePath = props.state.page?.path ?? null
watch(
  () => props.externalState?.value,
  (next) => {
    if (!next) return
    applyingExternal = true
    store.replace({
      content: clone(next.content ?? []),
      siteData: clone(next.siteData ?? {}),
      folderData: clone(next.folderData ?? {}),
      pageData: clone(next.pageData ?? {}),
    })
    store.folder = next.folder ?? null
    store.canFolder = next.folder != null
    pushStateUpdate({
      content: clone(store.content) as never,
      data: clone(store.effective),
      page: next.page ? clone(next.page) : undefined,
    })
    // A page *switch* starts fresh undo history; a same-page external update
    // stays undoable (so a bad on-disk edit can be rolled back locally).
    const nextPath = next.page?.path ?? currentPagePath
    if (nextPath !== currentPagePath) {
      currentPagePath = nextPath
      history.reset()
    }
    void nextTick(() => {
      applyingExternal = false
    })
  },
)

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
</script>
