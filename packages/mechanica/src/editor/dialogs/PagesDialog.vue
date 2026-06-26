<template>
  <VDialog title="Pages" size="wide">
    <div class="mech-pages-dialog">
      <div class="mech-pages-dialog__toolbar">
        <div class="mech-pages-dialog__search-wrap">
          <VIcon name="search" class="mech-pages-dialog__search-icon" />
          <input
            v-model="query"
            class="mech-input mech-pages-dialog__search"
            type="search"
            placeholder="Search pages by name or path…"
          />
        </div>
        <button type="button" class="mech-button is-primary" @click="startCreate">
          <VIcon name="plus" /> New page
        </button>
      </div>

      <form v-if="form" class="mech-pages-dialog__form" @submit.prevent="submitForm">
        <div class="mech-pages-dialog__form-title">{{ formTitle }}</div>
        <div class="mech-pages-dialog__form-grid">
          <label class="mech-pages-dialog__field">
            <span>Name</span>
            <input ref="nameInput" v-model="form.name" class="mech-input" placeholder="Page name" />
          </label>
          <label class="mech-pages-dialog__field">
            <span>Path</span>
            <input v-model="form.path" class="mech-input" placeholder="/path" />
          </label>
        </div>
        <p v-if="error" class="mech-pages-dialog__error">{{ error }}</p>
        <div class="mech-pages-dialog__form-actions">
          <button type="button" class="mech-button" @click="form = null">Cancel</button>
          <button type="submit" class="mech-button is-primary">{{ formSubmit }}</button>
        </div>
      </form>

      <div class="mech-pages-dialog__list">
        <template v-for="group in groups" :key="group.folder ?? '#root'">
          <button
            v-if="group.folder"
            type="button"
            class="mech-pages-dialog__folder"
            :class="{ 'is-collapsed': !isFolderOpen(group.folder) }"
            @click="toggleFolder(group.folder)"
          >
            <VIcon name="chevron-down" class="mech-pages-dialog__folder-chevron" />
            <VIcon name="folder" class="mech-pages-dialog__folder-icon" />
            <span class="mech-pages-dialog__folder-name">{{ group.folder }}</span>
            <span class="mech-pages-dialog__folder-count">{{ group.pages.length }}</span>
          </button>

          <template v-if="isFolderOpen(group.folder)">
            <div
              v-for="page in group.pages"
              :key="page.path"
              class="mech-pages-dialog__row"
              :class="{ 'is-current': page.path === current, 'is-nested': !!group.folder }"
            >
              <button type="button" class="mech-pages-dialog__open" @click="open(page)">
                <span class="mech-pages-dialog__name">{{ page.name }}</span>
                <span class="mech-pages-dialog__path">{{ page.path }}</span>
                <span v-if="page.path === current" class="mech-pages-dialog__badge">Current</span>
              </button>
              <div class="mech-pages-dialog__actions">
                <button type="button" title="Edit" @click="startEdit(page)"><VIcon name="pencil" /></button>
                <button type="button" title="Duplicate" @click="startDuplicate(page)"><VIcon name="copy" /></button>
                <button type="button" title="Delete" class="is-danger" @click="confirmRemove(page)">
                  <VIcon name="trash" />
                </button>
              </div>
            </div>
          </template>
        </template>

        <p v-if="!filtered.length" class="mech-pages-dialog__empty">
          {{ query ? `No pages match “${query}”.` : 'No pages yet.' }}
        </p>
      </div>
    </div>
  </VDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef } from 'vue'
import VDialog from '../ui/VDialog.vue'
import VIcon from '../components/VIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useDialog } from '../ui/dialog'
import { filterPages, groupPagesByFolder, type PageItem } from '../lib/page-list'

interface FormState {
  mode: 'create' | 'duplicate' | 'edit'
  source?: string
  sourceName?: string
  name: string
  path: string
}

const dialog = useDialog()
const pages = ref<PageItem[]>([])
const query = ref('')
const form = ref<FormState | null>(null)
const error = ref('')
const collapsedFolders = reactive(new Set<string>())
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

const current = typeof location !== 'undefined' ? location.pathname : '/'

const filtered = computed(() => filterPages(pages.value, query.value))
const groups = computed(() => groupPagesByFolder(filtered.value))

const formTitle = computed(() =>
  form.value?.mode === 'duplicate'
    ? `Duplicate “${form.value.sourceName}”`
    : form.value?.mode === 'edit'
      ? 'Edit page'
      : 'New page',
)
const formSubmit = computed(() =>
  form.value?.mode === 'duplicate' ? 'Duplicate' : form.value?.mode === 'edit' ? 'Save' : 'Create',
)

onMounted(load)

async function load() {
  try {
    pages.value = await fetch('/@mechanica/pages').then((response) => response.json())
  } catch {
    /* dev server unavailable */
  }
}

// Folders stay expanded while searching so matches are never hidden.
const isFolderOpen = (folder: string | null) => !folder || !!query.value || !collapsedFolders.has(folder)
const toggleFolder = (folder: string) =>
  collapsedFolders.has(folder) ? collapsedFolders.delete(folder) : collapsedFolders.add(folder)

function navigate(path: string) {
  try {
    location.assign(path)
  } catch {
    /* not available in tests */
  }
}
const open = (page: PageItem) => navigate(page.path)

async function focusName() {
  await nextTick()
  nameInput.value?.focus()
}
function startCreate() {
  error.value = ''
  form.value = { mode: 'create', name: '', path: '/' }
  void focusName()
}
function startDuplicate(page: PageItem) {
  error.value = ''
  form.value = { mode: 'duplicate', source: page.path, sourceName: page.name, name: `${page.name} copy`, path: '' }
  void focusName()
}
function startEdit(page: PageItem) {
  error.value = ''
  form.value = { mode: 'edit', source: page.path, name: page.name, path: page.path }
  void focusName()
}

async function submitForm() {
  if (!form.value) return
  error.value = ''
  const { mode, source } = form.value
  const name = form.value.name.trim()
  const path = form.value.path.trim()
  if (!name || !path) return

  const url =
    mode === 'duplicate'
      ? `/@mechanica/pages/duplicate?path=${encodeURIComponent(source!)}`
      : mode === 'edit'
        ? `/@mechanica/pages?path=${encodeURIComponent(source!)}`
        : '/@mechanica/pages'
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, path }),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    error.value = data?.error?.path ?? 'Could not save the page'
    return
  }

  const nextPath = data.path ?? path
  // Editing the page we're on (incl. a path change) navigates to it; editing
  // another page just refreshes the list. New/duplicate open the new page.
  if (mode === 'edit' && source !== current) {
    form.value = null
    await load()
  } else {
    navigate(nextPath)
  }
}

function confirmRemove(page: PageItem) {
  dialog.open(ConfirmDialog, {
    title: 'Delete page',
    message: `Delete “${page.name || page.path}”? This can’t be undone.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => void remove(page),
  })
}

async function remove(page: PageItem) {
  const response = await fetch(`/@mechanica/pages?path=${encodeURIComponent(page.path)}`, { method: 'DELETE' })
  if (!response.ok) return
  await load()
  // If we deleted the page we're editing, move somewhere that still exists.
  if (page.path === current) navigate(pages.value[0]?.path ?? '/')
}
</script>

<style lang="scss" scoped>
.mech-pages-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 42vh;
}
.mech-pages-dialog__toolbar {
  display: flex;
  gap: 8px;
}
.mech-pages-dialog__search-wrap {
  position: relative;
  flex: 1;
}
.mech-pages-dialog__search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--mech-muted);
  pointer-events: none;
}
.mech-pages-dialog__search {
  width: 100%;
  padding-left: 36px;
}

// ── Create / edit / duplicate form ──────────────────────────────────────────
.mech-pages-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--mech-app-bg);
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
}
.mech-pages-dialog__form-title {
  font-weight: 600;
  font-size: 13.5px;
}
.mech-pages-dialog__form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.mech-pages-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 5px;

  span {
    font-size: 12px;
    font-weight: 500;
    color: var(--mech-muted);
  }
}
.mech-pages-dialog__form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.mech-pages-dialog__error {
  margin: 0;
  color: var(--mech-error);
  font-size: 12px;
}

// ── Page list ────────────────────────────────────────────────────────────────
.mech-pages-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.mech-pages-dialog__folder {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  margin-top: 8px;
  padding: 6px 8px;
  border: none;
  background: none;
  border-radius: var(--mech-radius-sm);
  cursor: pointer;
  font: inherit;
  color: var(--mech-fg-alt);

  &:hover {
    background: var(--mech-hover);
  }
}
.mech-pages-dialog__folder-chevron {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--mech-muted);
  transition: transform 0.14s ease;
}
.mech-pages-dialog__folder.is-collapsed .mech-pages-dialog__folder-chevron {
  transform: rotate(-90deg);
}
.mech-pages-dialog__folder-icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
}
.mech-pages-dialog__folder-name {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mech-muted);
}
.mech-pages-dialog__folder-count {
  font-size: 11px;
  color: var(--mech-placeholder);
}
.mech-pages-dialog__row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--mech-radius-sm);

  &.is-nested {
    margin-left: 18px;
  }
  &:hover {
    background: var(--mech-hover);
  }
  &.is-current {
    background: var(--mech-accent-soft);
  }
}
.mech-pages-dialog__open {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  padding: 10px 10px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  color: var(--mech-fg);
  font: inherit;
}
.mech-pages-dialog__name {
  font-weight: 500;
  font-size: 13.5px;
  white-space: nowrap;
}
.mech-pages-dialog__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--mech-muted);
}
.mech-pages-dialog__badge {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mech-accent);
}
.mech-pages-dialog__actions {
  display: flex;
  gap: 1px;
  flex: none;
  padding-right: 6px;
  opacity: 0;

  .mech-pages-dialog__row:hover &,
  .mech-pages-dialog__row.is-current & {
    opacity: 1;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    background: none;
    color: var(--mech-muted);
    border-radius: var(--mech-radius-sm);
    cursor: pointer;
    line-height: 1;

    .vicon {
      width: 15px;
      height: 15px;
    }
    &:hover {
      background: var(--mech-active);
      color: var(--mech-fg);
    }
    &.is-danger:hover {
      color: var(--mech-error);
    }
  }
}
.mech-pages-dialog__empty {
  padding: 18px 4px;
  margin: 0;
  color: var(--mech-muted);
  font-size: 13px;
}
</style>
