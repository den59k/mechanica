<template>
  <div class="mech-rt-table" contenteditable="false">
    <TableEditor
      ref="tableRef"
      :block="block"
      :decorator="decorator"
      :editor="editor"
      @change="onChange"
      @contextmenu="onCellContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { Block } from 'vuewrite'
import { TableEditor } from 'vuewrite/table'
import type { TableAlign, TableCell, TableContextMenuEvent } from 'vuewrite/table'
import 'vuewrite/style.css'
import { decorator } from './config'
import { richTextEditorRefKey } from './keys'
import { contextMenuKey, type ContextMenuItem } from '../../lib/context-menu'

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

// ── Cell context menu ─────────────────────────────────────────────────────────
// TableEditor reports right-clicked cell coordinates; we turn them into the
// structural actions its hover strips can't express (insert *between*, delete a
// specific row/column, per-column alignment).

const contextMenu = inject(contextMenuKey, null)
const tableRef = ref<InstanceType<typeof TableEditor> | null>(null)

function onCellContextMenu({ event, row, col }: TableContextMenuEvent): void {
  const table = tableRef.value
  if (!contextMenu || !table) return // no controller (bare usage) → native menu
  // Claim this right-click: the outer editor's block menu must not also open.
  event.stopPropagation()

  const rows = (props.block.rows as TableCell[][] | undefined) ?? []
  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const align = ((props.block.align as TableAlign[] | undefined) ?? [])[col] ?? null
  const alignItem = (value: TableAlign, label: string, separatorBefore = false): ContextMenuItem => ({
    label,
    separatorBefore,
    checked: align === value,
    // Re-picking the active alignment resets the column to the default.
    onClick: () => table.setColumnAlign(col, align === value ? null : value),
  })

  contextMenu.openAt(event, [
    { label: 'Insert row above', onClick: () => table.insertRowAt(row) },
    { label: 'Insert row below', onClick: () => table.insertRowAt(row + 1) },
    { label: 'Insert column left', onClick: () => table.insertColumnAt(col) },
    { label: 'Insert column right', onClick: () => table.insertColumnAt(col + 1) },
    alignItem('left', 'Align left', true),
    alignItem('center', 'Align center'),
    alignItem('right', 'Align right'),
    { label: 'Delete row', separatorBefore: true, disabled: rows.length <= 1, onClick: () => table.removeRow(row) },
    { label: 'Delete column', disabled: cols <= 1, onClick: () => table.removeColumn(col) },
    { label: 'Delete table', separatorBefore: true, danger: true, onClick: () => table.deleteTable() },
  ])
}
</script>

<style lang="scss" scoped>
.mech-rt-table {
  margin: 0.5em 0;
  // Structural layout comes from vuewrite/style.css; theme it through the
  // --vw-table-* custom properties it exposes.
  :deep(.vw-table) {
    --vw-table-border: var(--mech-border);
    --vw-table-header-bg: var(--mech-field-bg);
    // Hovering the corner trash handle tints the whole grid — read as danger.
    --vw-table-hover-bg: color-mix(in srgb, var(--mech-error) 5%, transparent);
    --vw-table-control-bg: var(--mech-field-bg);
    --vw-table-control-bg-hover: var(--mech-field-bg-hover);
    --vw-table-muted: var(--mech-muted);
    --vw-table-danger: var(--mech-error);
    --vw-table-radius: var(--mech-radius-sm);
  }
  :deep(.vw-table-cell) {
    font-size: 13.5px;
  }
}
</style>
