<template>
  <div class="mech-composer" data-mech-ui>
    <header class="mech-composer__bar">
      <button type="button" class="mech-icon-button" title="Back" @click="goBack">
        <VIcon name="chevron-down" class="mech-composer__back" />
      </button>

      <input
        class="mech-composer__name"
        :value="store.def.name"
        placeholder="Block name"
        aria-label="Block name"
        @input="store.setMeta({ name: ($event.target as HTMLInputElement).value })"
      />

      <InsertToolbar />

      <div class="mech-composer__bar-gap" />

      <div class="mech-composer__breakpoints" role="group" aria-label="Breakpoint">
        <button
          v-for="bp in breakpoints"
          :key="bp.id"
          type="button"
          class="mech-composer__bp"
          :class="{ 'is-active': store.breakpoint === bp.id, 'is-variant': bp.id !== 'base' }"
          :title="bp.title"
          :aria-label="bp.label"
          @click="store.breakpoint = bp.id"
        >
          <VIcon :name="bp.icon" />
          <span v-if="bp.id !== 'base' && overriddenBps[bp.id]" class="mech-composer__bp-dot" />
        </button>
      </div>

      <div class="mech-composer__bar-gap" />

      <button type="button" class="mech-icon-button" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="history.undo()">
        <VIcon name="undo" />
      </button>
      <button type="button" class="mech-icon-button" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="history.redo()">
        <VIcon name="redo" />
      </button>

      <span class="mech-composer__save" :class="`is-${saveStatus}`">{{ saveLabel }}</span>
    </header>

    <div class="mech-composer__body">
      <aside class="mech-composer__panel mech-composer__panel--left">
        <ComposerLayers />
      </aside>

      <main class="mech-composer__stage">
        <ComposerCanvas />
      </main>

      <aside class="mech-composer__panel mech-composer__panel--right">
        <div v-if="store.breakpoint !== 'base'" class="mech-composer__bp-note">
          <VIcon :name="store.breakpoint === 'md' ? 'tablet' : 'mobile'" />
          <span>
            Editing <strong>{{ store.breakpoint === 'md' ? 'Tablet' : 'Mobile' }}</strong> styles
            <em>{{ store.breakpoint === 'md' ? 'apply at ≤ 1024px — tablet & mobile' : 'apply at ≤ 640px — mobile only' }}</em>
          </span>
          <button type="button" class="mech-icon-button" title="Back to Desktop" @click="store.breakpoint = 'base'">
            <VIcon name="close" />
          </button>
        </div>
        <MultiSelectPanel v-if="store.selectedIds.length > 1" />
        <ComposerInspector v-else-if="store.selected" />
        <ComposerSettings v-else />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, watch, onScopeDispose } from 'vue'
import { walkTree, type ComposedBlockDefinition } from 'mechanica-shared'
import type { BlocksMap } from '../../core/state'
import type { SaveController } from '../lib/types'
import { createComposerStore, type ComposerSnapshot } from './lib/composer-store'
import { createComposerHistory } from './lib/composer-history'
import { createInsertDnd } from './lib/use-insert-dnd'
import { insertItemForKey } from './lib/elements-meta'
import { shortcutChar } from '../lib/keyboard'
import { composerStoreKey, composerHistoryKey, composerInsertDndKey } from './lib/keys'
import type { CanvasBreakpoint } from './lib/canvas'
import VIcon from '../components/VIcon.vue'
import InsertToolbar from './components/InsertToolbar.vue'
import ComposerLayers from './components/ComposerLayers.vue'
import ComposerCanvas from './components/ComposerCanvas.vue'
import ComposerInspector from './components/ComposerInspector.vue'
import ComposerSettings from './components/ComposerSettings.vue'
import MultiSelectPanel from './components/MultiSelectPanel.vue'

const props = defineProps<{
  def: ComposedBlockDefinition
  blocks: BlocksMap
  /** The site's design-system components — offered in the insert palette. */
  codeBlocks?: import('mechanica-shared').Block[]
  save?: SaveController
  onChange?: (snapshot: ComposerSnapshot) => void
}>()

const store = createComposerStore(props.def)
provide(composerStoreKey, store)
provide('composerBlocks', props.blocks)
provide('composerCodeBlocks', props.codeBlocks ?? [])

const history = createComposerHistory(store)
const { canUndo, canRedo } = history
provide(composerHistoryKey, history)

provide(composerInsertDndKey, createInsertDnd(store))

const breakpoints: { id: CanvasBreakpoint; label: string; icon: string; width: number; title: string }[] = [
  { id: 'base', label: 'Desktop', icon: 'desktop', width: 1440, title: 'Desktop — base styles' },
  { id: 'md', label: 'Tablet', icon: 'tablet', width: 768, title: 'Tablet — style overrides at ≤ 1024px' },
  { id: 'sm', label: 'Mobile', icon: 'mobile', width: 390, title: 'Mobile — style overrides at ≤ 640px' },
]
provide('composerBreakpointWidth', computed(() => breakpoints.find((b) => b.id === store.breakpoint)!.width))

// A dot on the Tablet/Mobile buttons when any element carries overrides there —
// so a block's responsive variants are discoverable from the bar.
const overriddenBps = computed(() => {
  const found = { md: false, sm: false }
  walkTree(store.def.template, (node) => {
    const bp = node.data.$bp as Record<string, Record<string, unknown>> | undefined
    if (!bp || typeof bp !== 'object') return
    for (const key of ['md', 'sm'] as const) {
      const layer = bp[key]
      if (layer && typeof layer === 'object' && Object.keys(layer).length) found[key] = true
    }
  })
  return found
})

const saveStatus = computed(() => props.save?.status ?? 'saved')
const saveLabel = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
    case 'pending':
      return 'Saving…'
    case 'error':
      return 'Save failed'
    case 'conflict':
      return 'Changed on disk'
    default:
      return 'Saved'
  }
})

// Report every edit to the host (debounced save queue), like the page editor.
watch(
  () => store.def,
  () => props.onChange?.(store.snapshot()),
  { deep: true },
)

const goBack = () => {
  if (window.history.length > 1) window.history.back()
  else window.location.href = '/'
}

const onKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  const typing =
    !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  const mod = event.metaKey || event.ctrlKey
  // Match on physical key so the shortcuts fire under any keyboard layout.
  const ch = shortcutChar(event)
  if (mod && ch === 'z') {
    event.preventDefault()
    event.shiftKey ? history.redo() : history.undo()
    return
  }
  if (typing) return
  if (event.key === 'Escape') store.selectUp()
  else if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedId) {
    event.preventDefault()
    store.removeSelected()
  } else if (mod && ch === 'd' && store.selectedId) {
    event.preventDefault()
    store.duplicateSelected()
  } else if (mod && ch === 'g') {
    event.preventDefault()
    if (event.shiftKey) store.ungroup()
    else store.group()
  } else if (mod && ch === 'c' && store.selectedId) {
    event.preventDefault()
    store.copySelection()
  } else if (mod && ch === 'x' && store.selectedId) {
    event.preventDefault()
    store.cutSelection()
  } else if (mod && ch === 'v') {
    event.preventDefault()
    store.paste()
  } else if (!mod && !event.altKey && ch) {
    // R / C / T / I arm insertion of Row / Column / Text / Image at the selection.
    const item = insertItemForKey(ch)
    if (item) {
      event.preventDefault()
      store.insertItem(item)
    }
  }
}
document.addEventListener('keydown', onKeyDown)
onScopeDispose(() => {
  document.removeEventListener('keydown', onKeyDown)
  history.dispose()
})
</script>
