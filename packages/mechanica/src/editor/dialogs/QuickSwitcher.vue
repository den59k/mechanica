<template>
  <div class="mech-quick" role="dialog" aria-modal="true" data-mech-ui>
    <div class="mech-quick__search">
      <VIcon name="search" class="mech-quick__search-icon" />
      <input
        ref="input"
        v-model="query"
        class="mech-quick__input"
        type="text"
        placeholder="Go to page…"
        @keydown="onKey"
      />
    </div>

    <div ref="listEl" class="mech-quick__list">
      <template v-for="(item, index) in results" :key="item.path">
        <div v-if="item.group" class="mech-quick__group">{{ item.group }}</div>
        <button
          type="button"
          class="mech-quick__item"
          :class="{ 'is-active': index === active }"
          @click="select(item)"
          @mousemove="active = index"
        >
          <VIcon name="book" class="mech-quick__item-icon" />
          <span class="mech-quick__item-name">{{ item.name }}</span>
          <span class="mech-quick__item-hint">{{ item.path }}</span>
        </button>
      </template>
      <p v-if="!results.length" class="mech-quick__empty">No pages match “{{ query }}”.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import VIcon from '../components/VIcon.vue'
import { useDialog } from '../ui/dialog'
import { navigationKey, fallbackNavigation } from '../lib/navigation'
import { fetchPages, filterPages, type PageItem } from '../lib/page-list'
import { getRecents, recordRecent } from '../lib/recents'

interface QuickItem extends PageItem {
  /** Group header rendered above this item (set on the first item of a group). */
  group?: string
}

const dialog = useDialog()
const navigation = inject(navigationKey, null) ?? fallbackNavigation()

const query = ref('')
const active = ref(0)
const pages = ref<PageItem[]>([])
const input = useTemplateRef<HTMLInputElement>('input')
const listEl = useTemplateRef<HTMLDivElement>('listEl')

onMounted(async () => {
  input.value?.focus()
  pages.value = await fetchPages()
})

/** Tag the first item of each section with its group header. */
function section(title: string, items: PageItem[]): QuickItem[] {
  return items.map((item, i) => (i === 0 ? { ...item, group: title } : item))
}

const results = computed<QuickItem[]>(() => {
  const q = query.value.trim()
  if (q) return section('Pages', filterPages(pages.value, q))

  const recent = getRecents('pages')
    .map((path) => pages.value.find((page) => page.path === path))
    .filter((page): page is PageItem => !!page)
  const rest = pages.value.filter((page) => !recent.includes(page))
  return [...section('Recent', recent), ...section('Pages', rest)]
})

// Reset the highlight when the result set changes, and keep it in view.
watch(results, () => (active.value = 0))
watch(active, async () => {
  await nextTick()
  listEl.value?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' })
})

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, results.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = results.value[active.value]
    if (item) select(item)
  }
}

function select(item: QuickItem) {
  recordRecent('pages', item.path)
  void navigation.switchPage(item.path).then((ok) => {
    if (ok) dialog.back()
  })
}
</script>

<style lang="scss" scoped>
.mech-quick {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 60vh;
  background: var(--mech-bg);
  border-radius: 14px;
  box-shadow: var(--mech-shadow-dialog);
  overflow: hidden;
}
.mech-quick__search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--mech-border);
}
.mech-quick__search-icon {
  width: 16px;
  height: 16px;
  color: var(--mech-muted);
  flex: none;
}
.mech-quick__input {
  flex: 1;
  border: none;
  outline: none;
  background: none;
  font: inherit;
  font-size: 14px;
  color: var(--mech-fg);

  &::placeholder {
    color: var(--mech-placeholder);
  }
}
.mech-quick__list {
  overflow-y: auto;
  padding: 6px;
}
.mech-quick__group {
  padding: 10px 10px 4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mech-muted);
}
.mech-quick__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  font: inherit;
  text-align: left;
  color: var(--mech-fg);
  cursor: pointer;

  &.is-active {
    background: var(--mech-accent-soft);
  }
}
.mech-quick__item-icon {
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
  flex: none;

  .is-active & {
    color: var(--mech-accent);
  }
}
.mech-quick__item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mech-quick__item-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--mech-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mech-quick__empty {
  margin: 0;
  padding: 18px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--mech-muted);
}
</style>
