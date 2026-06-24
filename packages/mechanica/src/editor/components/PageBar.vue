<template>
  <button type="button" class="mech-pagebar" title="Browse pages" @click="openPages">
    <span class="mech-pagebar__glyph">▤</span>
    <span class="mech-pagebar__text">
      <span class="mech-pagebar__name">{{ currentName || 'Pages' }}</span>
      <span class="mech-pagebar__path">{{ current }}</span>
    </span>
    <span class="mech-pagebar__chevron">⌄</span>
  </button>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDialog } from '../ui/dialog'
import PagesDialog from '../dialogs/PagesDialog.vue'
import type { PageItem } from '../lib/page-list'

const dialog = useDialog()
const current = typeof location !== 'undefined' ? location.pathname : '/'
const currentName = ref('')

onMounted(async () => {
  try {
    const pages: PageItem[] = await fetch('/@mechanica/pages').then((response) => response.json())
    currentName.value = pages.find((page) => page.path === current)?.name ?? ''
  } catch {
    /* dev server unavailable */
  }
})

const openPages = () => dialog.open(PagesDialog)
</script>

<style lang="scss" scoped>
.mech-pagebar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--mech-border-strong);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  cursor: pointer;
  text-align: left;
  color: var(--mech-fg);
  font: inherit;
  transition:
    border-color 0.12s,
    background 0.12s;

  &:hover {
    border-color: var(--mech-muted);
    background: var(--mech-hover);
  }
}
.mech-pagebar__glyph {
  flex: none;
  color: var(--mech-muted);
  font-size: 14px;
}
.mech-pagebar__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.mech-pagebar__name {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-pagebar__path {
  font-size: 11.5px;
  color: var(--mech-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-pagebar__chevron {
  flex: none;
  color: var(--mech-muted);
}
</style>
