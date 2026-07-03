<template>
  <div class="mech-data">
    <!-- Left rail: one row per data entry, with its current scope. -->
    <nav class="mech-data__rail">
      <button
        v-for="entry in store.dataEntries"
        :key="entry.id"
        type="button"
        class="mech-data__entry"
        :class="{ 'is-active': entry.id === activeId }"
        @click="activeId = entry.id"
      >
        <span class="mech-data__entry-name">{{ entry.title ?? entry.id }}</span>
        <span class="mech-data__entry-scope" :class="`is-${store.scopeOf(entry.id)}`">
          {{ scopeLabel(store.scopeOf(entry.id)) }}
        </span>
      </button>
    </nav>

    <!-- Right pane: scope switch + the entry's form. -->
    <section v-if="active" class="mech-data__pane">
      <header class="mech-data__head">
        <h3 class="mech-data__title">{{ active.title ?? active.id }}</h3>
        <div class="mech-data__switch" role="tablist" aria-label="Data scope">
          <button
            type="button"
            class="mech-data__seg"
            :class="{ 'is-active': currentScope === 'site' }"
            @click="store.setScope(active.id, 'site')"
          >
            Site
          </button>
          <button
            v-if="store.canFolder"
            type="button"
            class="mech-data__seg"
            :class="{ 'is-active': currentScope === 'folder' }"
            @click="store.setScope(active.id, 'folder')"
          >
            Folder
          </button>
          <button
            type="button"
            class="mech-data__seg"
            :class="{ 'is-active': currentScope === 'page' }"
            @click="store.setScope(active.id, 'page')"
          >
            This page
          </button>
        </div>
      </header>

      <p class="mech-data__note" :class="{ 'is-warn': currentScope === 'site' }">
        <template v-if="currentScope === 'site'">
          Editing <strong>site-wide</strong> data — changes apply to every page.
        </template>
        <template v-else-if="currentScope === 'folder'">
          Applies to every page in this folder, unless a page overrides it.
        </template>
        <template v-else>This value overrides the site/folder data for the current page only.</template>
      </p>

      <SchemaForm
        v-if="active.props"
        :key="`${active.id}:${currentScope}`"
        :model-value="store.dataValue(active.id)"
        :schema="active.props"
      />
    </section>
    <p v-else class="mech-settings__empty">This page has no editable data.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { DataScope } from 'mechanica-shared'
import { editorStoreKey } from '../lib/store'
import SchemaForm from '../props-panel/SchemaForm.vue'

const store = inject(editorStoreKey)!

const activeId = ref<string | null>(store.dataEntries[0]?.id ?? null)
const active = computed(
  () => store.dataEntries.find((entry) => entry.id === activeId.value) ?? store.dataEntries[0] ?? null,
)
const currentScope = computed<DataScope>(() => (active.value ? store.scopeOf(active.value.id) : 'page'))

const scopeLabel = (scope: DataScope) => (scope === 'site' ? 'Site' : scope === 'folder' ? 'Folder' : 'Page')
</script>

<style lang="scss" scoped>
.mech-data {
  display: flex;
  gap: 20px;
  min-height: 320px;
}

// ── Left rail ────────────────────────────────────────────────────────────────
.mech-data__rail {
  flex: none;
  width: 178px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 14px;
  border-right: 1px solid var(--mech-border);
}
.mech-data__entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: none;
  border-radius: var(--mech-radius-sm);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--mech-fg-alt);
  transition:
    background 0.12s,
    color 0.12s;

  &:hover {
    background: var(--mech-hover);
  }
  &.is-active {
    background: var(--mech-accent-soft);
    color: var(--mech-fg);
  }
}
.mech-data__entry-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-data__entry-scope {
  flex: none;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mech-muted);

  &.is-page {
    color: var(--mech-accent);
  }
}

// ── Right pane ───────────────────────────────────────────────────────────────
.mech-data__pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mech-data__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.mech-data__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.mech-data__switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--mech-field-bg);
  border-radius: var(--mech-radius);
}
.mech-data__seg {
  padding: 5px 12px;
  border: none;
  background: none;
  border-radius: var(--mech-radius-sm);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mech-muted);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    box-shadow 0.12s;

  &:hover {
    color: var(--mech-fg);
  }
  &.is-active {
    background: var(--mech-bg);
    color: var(--mech-fg);
    box-shadow: var(--mech-shadow-pop);
  }
}
.mech-data__note {
  margin: 0;
  font-size: 12.5px;
  color: var(--mech-muted);

  strong {
    font-weight: 600;
    color: var(--mech-fg-alt);
  }
  // Site scope edits shared data — make that unmistakable.
  &.is-warn {
    padding: 9px 12px;
    border-radius: var(--mech-radius-sm);
    background: #fdf4e7;
    color: #92580e;
    border: 1px solid #f4d9a8;

    strong {
      color: #7a4708;
    }
  }
}
</style>
