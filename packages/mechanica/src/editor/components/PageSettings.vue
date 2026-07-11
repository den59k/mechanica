<template>
  <div class="mech-page-setup">
    <!-- Layout: the shell this page renders in. Set once, unlike the language
         switcher (which stays in the sidebar for constant comparison). -->
    <div v-if="layoutNames.length > 1" class="mech-page-setup__field">
      <span class="mech-page-setup__label">Layout</span>
      <div class="mech-page-setup__choices" role="radiogroup" aria-label="Page layout">
        <button
          v-for="name in layoutNames"
          :key="name"
          type="button"
          class="mech-page-setup__choice"
          :class="{ 'is-active': name === currentLayout }"
          :disabled="layoutLocked"
          role="radio"
          :aria-checked="name === currentLayout"
          @click="pickLayout(name)"
        >
          <span class="mech-page-setup__choice-name">{{ humanize(name) }}</span>
          <span v-if="name === layoutNames[0]" class="mech-page-setup__choice-default">Default</span>
        </button>
      </div>
      <p class="mech-page-setup__hint">
        <template v-if="layoutLocked">
          The layout is set on the {{ store.defaultLocaleLabel ?? 'default' }} page — translations follow it.
        </template>
        <template v-else>The shell around this page's content — header, footer, chrome.</template>
      </p>
    </div>

    <!-- Page block: turn the page into (or between) single-block pages. -->
    <div v-if="standaloneBlocks.length" class="mech-page-setup__field">
      <span class="mech-page-setup__label">Page block</span>
      <VSelect
        :model-value="currentBlockId"
        :options="blockOptions"
        :placeholder="blockPlaceholder"
        aria-label="Page block"
        @update:model-value="pickBlock($event as string)"
      />
      <p class="mech-page-setup__hint">
        Whole-page blocks — a form, a 404. Picking one becomes this page's entire content.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { editorStoreKey } from '../lib/store'
import { runtimeLayoutNames } from '../lib/bridge'
import { standalonePageBlockId, applyPageBlock } from '../lib/page-setup'
import { humanize } from '../props-panel/humanize'
import VSelect, { type SelectOption } from './VSelect.vue'

/**
 * The "Page setup" pane of the Page data dialog: the page's layout and its
 * standalone (whole-page) block. Both are set-once page properties, so they
 * live here rather than in the always-visible sidebar. Edits flow through the
 * editor store — undoable, live-previewed, saved like any other change.
 */
const store = inject(editorStoreKey)!

// ── Layout ────────────────────────────────────────────────────────────────
const layoutNames = runtimeLayoutNames()

const currentLayout = computed(() =>
  store.layout && layoutNames.includes(store.layout) ? store.layout : layoutNames[0],
)
// Base-owned on multi-language sites: translations inherit, so the control locks.
const layoutLocked = computed(() => store.locale != null && store.locale !== store.defaultLocale)

function pickLayout(name: string) {
  // The default (first) layout is stored as "no layout" — page files stay clean.
  store.layout = name === layoutNames[0] ? null : name
}

// ── Page block (standalone) ───────────────────────────────────────────────
const standaloneBlocks = computed(() => store.blocks.filter((block) => block.standalone && !block.hidden))
const blockOptions = computed<SelectOption[]>(() =>
  standaloneBlocks.value.map((block) => ({ value: block.id, label: block.name })),
)

/** The page's current standalone block — only when it IS the whole page. */
const currentBlockId = computed(() => standalonePageBlockId(store.content, store.blocksById))
const blockPlaceholder = computed(() => (store.content.length ? 'Custom blocks' : 'Choose a block…'))

function pickBlock(id: string) {
  const meta = store.blocksById.get(id)
  if (!meta) return
  const block = applyPageBlock(store.content, meta, store.blocksById, (message) => window.confirm(message))
  if (block) store.select(block.id)
}
</script>

<style lang="scss" scoped>
.mech-page-setup {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 420px;
}
.mech-page-setup__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mech-page-setup__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--mech-fg-alt);
}
.mech-page-setup__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--mech-muted);
}

// Layouts are few by design — radio cards read faster than a dropdown and show
// every option (and which is the site default) at a glance.
.mech-page-setup__choices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.mech-page-setup__choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.12s,
    box-shadow 0.12s,
    background 0.12s;

  &:hover:not(:disabled) {
    border-color: var(--mech-border-strong);
  }
  &.is-active {
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 1px var(--mech-accent);
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
.mech-page-setup__choice-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--mech-fg);
}
.mech-page-setup__choice-default {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--mech-muted);

  .is-active & {
    color: var(--mech-accent);
  }
}
</style>
