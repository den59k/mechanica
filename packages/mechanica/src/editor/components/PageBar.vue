<template>
  <button type="button" class="mech-pagebar" title="Browse pages" @click="openPages">
    <span class="mech-pagebar__icon"><VIcon name="book" /></span>
    <span class="mech-pagebar__text">
      <span class="mech-pagebar__name">{{ currentName || 'Select a page' }}</span>
      <span class="mech-pagebar__path">{{ current }}</span>
    </span>
    <VIcon name="chevron-down" class="mech-pagebar__chevron" />
  </button>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useDialog } from '../ui/dialog'
import PagesDialog from '../dialogs/PagesDialog.vue'
import VIcon from './VIcon.vue'
import type { PageItem } from '../lib/page-list'
import { navigationKey, fallbackNavigation } from '../lib/navigation'

const dialog = useDialog()
const navigation = inject(navigationKey, null) ?? fallbackNavigation()
const current = computed(() => navigation.path.value)
const currentName = ref('')

// Re-resolve the display name whenever the page switches in place.
watch(
  current,
  async (path) => {
    try {
      const pages: PageItem[] = await fetch('/@mechanica/pages').then((response) => response.json())
      currentName.value = pages.find((page) => page.path === path)?.name ?? ''
    } catch {
      /* dev server unavailable */
    }
  },
  { immediate: true },
)

const openPages = () => dialog.open(PagesDialog)
</script>

<style lang="scss" scoped>
.mech-pagebar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  cursor: pointer;
  text-align: left;
  color: var(--mech-fg);
  font: inherit;
  box-shadow: 0 1px 2px rgba(20, 23, 28, 0.04);
  transition:
    border-color 0.12s,
    box-shadow 0.12s;

  &:hover {
    border-color: var(--mech-border-strong);
    box-shadow: 0 2px 6px rgba(20, 23, 28, 0.07);
  }
}
.mech-pagebar__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--mech-radius-sm);
  background: var(--mech-accent-soft);
  color: var(--mech-accent);

  .vicon {
    width: 17px;
    height: 17px;
  }
}
.mech-pagebar__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
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
  width: 16px;
  height: 16px;
  color: var(--mech-muted);
}
</style>
