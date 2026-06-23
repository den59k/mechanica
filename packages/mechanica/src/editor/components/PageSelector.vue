<template>
  <div class="mech-pages">
    <div class="mech-pages__row">
      <select
        class="mech-input mech-pages__select"
        :value="current"
        @change="go(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!pages.some((p) => p.path === current)" :value="current">{{ current }}</option>
        <option v-for="page in pages" :key="page.path" :value="page.path">
          {{ page.name }} — {{ page.path }}
        </option>
      </select>
      <button type="button" class="mech-button mech-pages__add" title="New page" @click="open('create')">
        +
      </button>
    </div>

    <div class="mech-pages__actions">
      <button type="button" class="mech-pages__action" @click="open('rename')">Rename</button>
      <button type="button" class="mech-pages__action" @click="open('duplicate')">Duplicate</button>
      <button type="button" class="mech-pages__action mech-pages__action--danger" @click="remove">
        Delete
      </button>
    </div>

    <form v-if="mode" class="mech-pages__new" @submit.prevent="submit">
      <input v-model="formName" class="mech-input" placeholder="Page name" />
      <input v-if="mode !== 'rename'" v-model="formPath" class="mech-input" placeholder="/path" />
      <button type="submit" class="mech-button is-primary is-block">{{ submitLabel }}</button>
      <p v-if="error" class="mech-pages__error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface PageItem {
  path: string
  name: string
}

type FormMode = 'create' | 'duplicate' | 'rename'

const pages = ref<PageItem[]>([])
const current = ref(typeof location !== 'undefined' ? location.pathname : '/')
const mode = ref<FormMode | null>(null)
const formName = ref('')
const formPath = ref('/')
const error = ref('')

const submitLabel = computed(() =>
  mode.value === 'rename' ? 'Rename' : mode.value === 'duplicate' ? 'Duplicate page' : 'Create page',
)

onMounted(load)

async function load() {
  try {
    pages.value = await fetch('/@mechanica/pages').then((response) => response.json())
  } catch {
    /* dev server unavailable */
  }
}

const currentName = () => pages.value.find((p) => p.path === current.value)?.name ?? ''

function navigate(path: string) {
  try {
    location.assign(path)
  } catch {
    /* not available in tests */
  }
}

function go(path: string) {
  if (path !== current.value) navigate(path)
}

/** Open (or toggle off) an inline form, seeding sensible defaults per mode. */
function open(next: FormMode) {
  mode.value = mode.value === next ? null : next
  error.value = ''
  if (next === 'rename') {
    formName.value = currentName()
  } else if (next === 'duplicate') {
    formName.value = `${currentName() || 'Page'} copy`
    formPath.value = ''
  } else {
    formName.value = ''
    formPath.value = '/'
  }
}

async function submit() {
  error.value = ''
  const name = formName.value.trim()
  if (!name) return

  // Rename only updates the display name; the path stays put.
  if (mode.value === 'rename') {
    await fetch(`/@mechanica/pages?path=${encodeURIComponent(current.value)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    mode.value = null
    await load()
    return
  }

  const path = formPath.value.trim()
  if (!path) return
  const url =
    mode.value === 'duplicate'
      ? `/@mechanica/pages/duplicate?path=${encodeURIComponent(current.value)}`
      : '/@mechanica/pages'

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, path }),
  })
  const data = await response.json().catch(() => ({}))

  if (response.ok) navigate(data.path ?? path)
  else error.value = data?.error?.path ?? 'Could not save page'
}

async function remove() {
  const label = currentName() || current.value
  if (typeof confirm === 'function' && !confirm(`Delete "${label}"? This cannot be undone.`)) return

  const response = await fetch(`/@mechanica/pages?path=${encodeURIComponent(current.value)}`, {
    method: 'DELETE',
  })
  if (!response.ok) return

  await load()
  const next = pages.value.find((p) => p.path !== current.value)
  navigate(next?.path ?? '/')
}
</script>

<style lang="scss" scoped>
.mech-pages {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--mech-border);
}
.mech-pages__row {
  display: flex;
  gap: 6px;
}
.mech-pages__select {
  flex: 1;
  min-width: 0;
}
.mech-pages__add {
  flex: none;
  width: 36px;
  padding: 0;
  font-size: 17px;
}
.mech-pages__actions {
  display: flex;
  gap: 6px;
}
.mech-pages__action {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--mech-muted);
  background: none;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius-sm);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;

  &:hover {
    color: var(--mech-fg);
    background: var(--mech-hover);
    border-color: var(--mech-border-strong);
  }
  &--danger:hover {
    color: var(--mech-error);
    border-color: color-mix(in srgb, var(--mech-error) 45%, var(--mech-border));
    background: rgba(221, 40, 40, 0.05);
  }
}
.mech-pages__new {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mech-pages__error {
  color: var(--mech-error);
  font-size: 12px;
  margin: 0;
}
</style>
