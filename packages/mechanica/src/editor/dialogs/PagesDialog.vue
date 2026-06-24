<template>
  <VDialog title="Pages" size="wide">
    <div class="mech-pages-dialog">
      <div class="mech-pages-dialog__toolbar">
        <input
          v-model="query"
          class="mech-input mech-pages-dialog__search"
          type="search"
          placeholder="Search pages by name or path…"
        />
        <button type="button" class="mech-button is-primary" @click="startCreate">New page</button>
      </div>

      <form v-if="form" class="mech-pages-dialog__form" @submit.prevent="submitForm">
        <div class="mech-pages-dialog__form-title">
          {{ form.mode === 'duplicate' ? `Duplicate “${form.sourceName}”` : 'New page' }}
        </div>
        <div class="mech-pages-dialog__form-row">
          <input v-model="form.name" class="mech-input" placeholder="Page name" />
          <input v-model="form.path" class="mech-input" placeholder="/path" />
          <button type="button" class="mech-button" @click="form = null">Cancel</button>
          <button type="submit" class="mech-button is-primary">
            {{ form.mode === 'duplicate' ? 'Duplicate' : 'Create' }}
          </button>
        </div>
        <p v-if="error" class="mech-pages-dialog__error">{{ error }}</p>
      </form>

      <div class="mech-pages-dialog__list">
        <template v-for="group in groups" :key="group.folder ?? '#root'">
          <div v-if="group.folder" class="mech-pages-dialog__folder">{{ group.folder }}</div>
          <div
            v-for="page in group.pages"
            :key="page.path"
            class="mech-pages-dialog__row"
            :class="{ 'is-current': page.path === current }"
          >
            <template v-if="renaming === page.path">
              <input
                ref="renameInput"
                v-model="renameValue"
                class="mech-input mech-pages-dialog__rename"
                @keydown.enter.prevent="submitRename(page)"
                @keydown.esc="renaming = null"
              />
              <button type="button" class="mech-button" @click="submitRename(page)">Save</button>
            </template>
            <template v-else>
              <button type="button" class="mech-pages-dialog__open" @click="open(page)">
                <span class="mech-pages-dialog__name">{{ page.name }}</span>
                <span class="mech-pages-dialog__path">{{ page.path }}</span>
                <span v-if="page.path === current" class="mech-pages-dialog__badge">Current</span>
              </button>
              <div class="mech-pages-dialog__actions">
                <button type="button" title="Rename" @click="startRename(page)"><VIcon name="pencil" /></button>
                <button type="button" title="Duplicate" @click="startDuplicate(page)"><VIcon name="copy" /></button>
                <button type="button" title="Delete" class="is-danger" @click="remove(page)"><VIcon name="trash" /></button>
              </div>
            </template>
          </div>
        </template>
        <p v-if="!filtered.length" class="mech-pages-dialog__empty">
          {{ query ? `No pages match “${query}”.` : 'No pages yet.' }}
        </p>
      </div>
    </div>
  </VDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import VDialog from '../ui/VDialog.vue'
import VIcon from '../components/VIcon.vue'
import { filterPages, groupPagesByFolder, type PageItem } from '../lib/page-list'

interface FormState {
  mode: 'create' | 'duplicate'
  source?: string
  sourceName?: string
  name: string
  path: string
}

const pages = ref<PageItem[]>([])
const query = ref('')
const form = ref<FormState | null>(null)
const renaming = ref<string | null>(null)
const renameValue = ref('')
const error = ref('')
const renameInput = useTemplateRef<HTMLInputElement[]>('renameInput')

const current = typeof location !== 'undefined' ? location.pathname : '/'

const filtered = computed(() => filterPages(pages.value, query.value))
const groups = computed(() => groupPagesByFolder(filtered.value))

onMounted(load)

async function load() {
  try {
    pages.value = await fetch('/@mechanica/pages').then((response) => response.json())
  } catch {
    /* dev server unavailable */
  }
}

function navigate(path: string) {
  try {
    location.assign(path)
  } catch {
    /* not available in tests */
  }
}

const open = (page: PageItem) => navigate(page.path)

function startCreate() {
  renaming.value = null
  error.value = ''
  form.value = { mode: 'create', name: '', path: '/' }
}

function startDuplicate(page: PageItem) {
  renaming.value = null
  error.value = ''
  form.value = { mode: 'duplicate', source: page.path, sourceName: page.name, name: `${page.name} copy`, path: '' }
}

async function submitForm() {
  if (!form.value) return
  error.value = ''
  const name = form.value.name.trim()
  const path = form.value.path.trim()
  if (!name || !path) return

  const url =
    form.value.mode === 'duplicate'
      ? `/@mechanica/pages/duplicate?path=${encodeURIComponent(form.value.source!)}`
      : '/@mechanica/pages'
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, path }),
  })
  const data = await response.json().catch(() => ({}))

  if (response.ok) navigate(data.path ?? path)
  else error.value = data?.error?.path ?? 'Could not save the page'
}

async function startRename(page: PageItem) {
  form.value = null
  renameValue.value = page.name
  renaming.value = page.path
  await nextTick()
  renameInput.value?.[0]?.focus()
}

async function submitRename(page: PageItem) {
  const name = renameValue.value.trim()
  if (name) {
    await fetch(`/@mechanica/pages?path=${encodeURIComponent(page.path)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }
  renaming.value = null
  await load()
}

async function remove(page: PageItem) {
  if (typeof confirm === 'function' && !confirm(`Delete “${page.name || page.path}”? This cannot be undone.`)) {
    return
  }
  const response = await fetch(`/@mechanica/pages?path=${encodeURIComponent(page.path)}`, { method: 'DELETE' })
  if (!response.ok) return

  await load()
  // If we deleted the page we're currently editing, move somewhere that exists.
  if (page.path === current) navigate(pages.value[0]?.path ?? '/')
}
</script>

<style lang="scss" scoped>
.mech-pages-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 40vh;
}
.mech-pages-dialog__toolbar {
  display: flex;
  gap: 8px;
}
.mech-pages-dialog__search {
  flex: 1;
}
.mech-pages-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--mech-active);
  border-radius: var(--mech-radius);
}
.mech-pages-dialog__form-title {
  font-weight: 600;
  font-size: 13px;
}
.mech-pages-dialog__form-row {
  display: flex;
  gap: 8px;

  .mech-input {
    flex: 1;
  }
}
.mech-pages-dialog__error {
  margin: 0;
  color: var(--mech-error);
  font-size: 12px;
}
.mech-pages-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mech-pages-dialog__folder {
  margin-top: 10px;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mech-muted);
}
.mech-pages-dialog__row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--mech-radius-sm);

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
  padding: 9px 10px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  color: var(--mech-fg);
  font: inherit;
}
.mech-pages-dialog__name {
  font-weight: 500;
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
.mech-pages-dialog__rename {
  flex: 1;
  margin: 4px 0;
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
  padding: 16px 4px;
  margin: 0;
  color: var(--mech-muted);
  font-size: 13px;
}
</style>
