<template>
  <div class="mech-settings">
    <div class="mech-settings__title">Page settings</div>
    <div class="mech-form">
      <label class="mech-field">
        <span class="mech-field__label">Title</span>
        <input
          class="mech-input"
          :value="meta.title"
          placeholder="Untitled page"
          @input="meta.title = ($event.target as HTMLInputElement).value"
        />
        <span class="mech-field__hint">Used for the browser tab and the page's &lt;title&gt;.</span>
      </label>
      <label class="mech-field">
        <span class="mech-field__label">Description</span>
        <textarea
          class="mech-input mech-textarea"
          rows="3"
          :value="meta.description"
          placeholder="Short summary for search engines"
          @input="meta.description = ($event.target as HTMLTextAreaElement).value"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, watchEffect } from 'vue'
import { editorStoreKey } from './store'

const store = inject(editorStoreKey)!
const meta = computed<Record<string, any>>(() => (store.page.meta ??= {}))

// Reflect the title in the browser tab live (dev serves the raw `{{ }}` template).
watchEffect(() => {
  if (typeof document !== 'undefined' && meta.value.title) document.title = meta.value.title
})
</script>
