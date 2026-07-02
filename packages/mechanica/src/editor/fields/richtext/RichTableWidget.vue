<template>
  <div class="mech-rt-table" contenteditable="false">
    <TableEditor :block="block" :decorator="decorator" :editor="editor" @change="onChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Block } from 'vuewrite'
import { TableEditor } from 'vuewrite/table'
import 'vuewrite/style.css'
import { decorator } from './config'
import { richTextEditorRefKey } from './keys'

const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ change: [] }>()

// With the outer editor ref, TableEditor pushes history and handles deleting
// the block itself — forwarding `change` too would double every history entry,
// so only fall back to the widget contract when the ref isn't provided.
const editorRef = inject(richTextEditorRefKey, null)
const editor = computed(() => editorRef?.value)
const onChange = (): void => {
  if (!editorRef?.value) emit('change')
}
</script>

<style lang="scss" scoped>
.mech-rt-table {
  margin: 0.5em 0;
  // Structural layout comes from vuewrite/style.css; theme it to the editor.
  :deep(.vw-table-cell) {
    border-color: var(--mech-border);
    font-size: 13.5px;
  }
  :deep(th.vw-table-cell) {
    background: var(--mech-field-bg);
    font-weight: 600;
    text-align: left;
  }
  :deep(.vw-table-remove) {
    color: var(--mech-muted);
  }
  :deep(.vw-table-btn) {
    border-color: var(--mech-input-border);
    color: var(--mech-muted);
    border-radius: var(--mech-radius-sm);

    &:hover {
      color: var(--mech-fg);
    }
  }
}
</style>
