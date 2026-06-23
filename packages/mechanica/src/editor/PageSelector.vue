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
      <button type="button" class="mech-button mech-pages__add" title="New page" @click="creating = !creating">
        +
      </button>
    </div>

    <form v-if="creating" class="mech-pages__new" @submit.prevent="create">
      <input v-model="newName" class="mech-input" placeholder="Page name" />
      <input v-model="newPath" class="mech-input" placeholder="/path" />
      <button type="submit" class="mech-button">Create page</button>
      <p v-if="error" class="mech-pages__error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface PageItem {
  path: string
  name: string
}

const pages = ref<PageItem[]>([])
const current = ref(typeof location !== 'undefined' ? location.pathname : '/')
const creating = ref(false)
const newName = ref('')
const newPath = ref('/')
const error = ref('')

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

function go(path: string) {
  if (path !== current.value) navigate(path)
}

async function create() {
  error.value = ''
  const name = newName.value.trim()
  const path = newPath.value.trim()
  if (!name || !path) return

  const response = await fetch('/@mechanica/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, path }),
  })
  const data = await response.json().catch(() => ({}))

  if (response.ok) navigate(data.path ?? path)
  else error.value = data?.error?.path ?? 'Could not create page'
}
</script>
