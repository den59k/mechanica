<template>
  <div class="mech-pages" data-mech-ui>
    <div class="mech-pages__card" role="dialog" aria-modal="true">
      <header class="mech-pages__header">
        <h2 class="mech-pages__title">Pages</h2>
        <span class="mech-pages__count">{{ pages.length }}</span>
        <button type="button" class="mech-pages__close" aria-label="Close" @click="dialog.back()">
          <VIcon name="close" />
        </button>
      </header>

      <div class="mech-pages__toolbar">
        <div class="mech-pages__search-wrap">
          <VIcon name="search" class="mech-pages__search-icon" />
          <input
            ref="searchInput"
            v-model="query"
            class="mech-input mech-pages__search"
            type="search"
            placeholder="Search pages…"
            @keydown="onSearchKey"
          />
        </div>
        <button type="button" class="mech-button is-primary" @click="startCreate">
          <VIcon name="plus" /> New page
        </button>
      </div>

      <div class="mech-pages__content">
        <nav v-if="folders.length" class="mech-pages__rail">
          <button
            type="button"
            class="mech-pages__rail-item"
            :class="{ 'is-active': !activeFolder && !searching }"
            @click="selectFolder(null)"
          >
            <VIcon name="book" />
            <span class="mech-pages__rail-name">All pages</span>
            <span class="mech-pages__rail-count">{{ pages.length }}</span>
          </button>
          <button
            v-for="folder in folders"
            :key="folder.name"
            type="button"
            class="mech-pages__rail-item"
            :class="{ 'is-active': activeFolder === folder.name && !searching }"
            @click="selectFolder(folder.name)"
          >
            <VIcon name="folder" />
            <span class="mech-pages__rail-name">{{ folder.name }}</span>
            <span class="mech-pages__rail-count">{{ folder.count }}</span>
          </button>
        </nav>

        <div ref="listEl" class="mech-pages__list">
          <div class="mech-pages__thead">
            <span>Name</span>
            <span>Path</span>
            <span aria-hidden="true" />
          </div>

          <template v-for="group in groups" :key="group.folder ?? '#root'">
            <button
              v-if="showGroupHeaders && group.folder"
              type="button"
              class="mech-pages__group"
              title="Show only this folder"
              @click="selectFolder(group.folder)"
            >
              <VIcon name="folder" />
              {{ group.folder }}
            </button>

            <div
              v-for="page in group.pages"
              :key="page.path"
              class="mech-pages__row"
              :class="{ 'is-active': page.path === activePath, 'is-current': page.path === current }"
              @click="open(page)"
              @mouseenter="activePath = page.path"
              @contextmenu="onRowMenu($event, page)"
            >
              <span class="mech-pages__cell-name">
                <span class="mech-pages__name">{{ page.name || page.path }}</span>
                <span v-if="page.draft" class="mech-pages__badge is-draft">Draft</span>
                <span v-if="page.path === current" class="mech-pages__badge">Current</span>
              </span>
              <span class="mech-pages__cell-path">{{ page.path }}</span>
              <span class="mech-pages__actions" @click.stop>
                <button type="button" title="Rename" @click="startEdit(page)"><VIcon name="pencil" /></button>
                <button type="button" title="Duplicate" @click="startDuplicate(page)"><VIcon name="copy" /></button>
                <button type="button" title="Delete" class="is-danger" @click="confirmRemove(page)">
                  <VIcon name="trash" />
                </button>
              </span>
            </div>
          </template>

          <p v-if="!rows.length" class="mech-pages__empty">
            {{ query ? `No pages match “${query}”.` : 'No pages yet.' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Live preview of the highlighted (hovered / keyboard-active) page,
         floating beside the card. Hidden on narrow viewports. -->
    <aside class="mech-pages__preview">
      <div class="mech-pages__preview-frame">
        <img
          v-if="previewPage && !thumbFailed.has(previewPage.path)"
          :key="previewPage.path"
          :src="thumbSrc(previewPage)"
          :data-path="previewPage.path"
          alt=""
          @error="onThumbError"
        />
        <div v-else class="mech-pages__preview-empty">
          <span class="mech-pages__preview-monogram">{{ monogram }}</span>
          <template v-if="previewPage">
            <p>No preview yet</p>
            <code>mechanica thumbs</code>
          </template>
        </div>
      </div>
      <div v-if="previewPage" class="mech-pages__preview-caption">
        <span class="mech-pages__preview-name">{{ previewPage.name || previewPage.path }}</span>
        <span class="mech-pages__preview-path">{{ previewPage.path }}</span>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import VIcon from '../components/VIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import PageFormDialog from './PageFormDialog.vue'
import { useDialog } from '../ui/dialog'
import { contextMenuKey } from '../lib/context-menu'
import { filterPages, groupPagesByFolder, pageThumbUrl, type PageItem } from '../lib/page-list'
import { navigationKey, fallbackNavigation } from '../lib/navigation'
import { recordRecent } from '../lib/recents'

const dialog = useDialog()
const contextMenu = inject(contextMenuKey, null)
const navigation = inject(navigationKey, null) ?? fallbackNavigation()
const current = computed(() => navigation.path.value)

const pages = ref<PageItem[]>([])
const query = ref('')
const activeFolder = ref<string | null>(null)
/** The highlighted row — set by hover or arrow keys; drives the side preview. */
const activePath = ref<string | null>(null)

const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const listEl = useTemplateRef<HTMLDivElement>('listEl')

const searching = computed(() => !!query.value.trim())

const folders = computed(() => {
  const counts = new Map<string, number>()
  for (const page of pages.value) {
    if (page.folderPath) counts.set(page.folderPath, (counts.get(page.folderPath) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }))
})

// Search is global — it ignores the folder filter so a match can never hide.
const visible = computed(() => {
  if (searching.value) return filterPages(pages.value, query.value)
  if (activeFolder.value) return pages.value.filter((page) => page.folderPath === activeFolder.value)
  return pages.value
})
const groups = computed(() => groupPagesByFolder(visible.value))
/** Flat list in render order — keyboard navigation walks this. */
const rows = computed(() => groups.value.flatMap((group) => group.pages))
// Inside a single folder the rail already names it; headers would be noise.
const showGroupHeaders = computed(() => searching.value || !activeFolder.value)

const previewPage = computed(() => rows.value.find((page) => page.path === activePath.value) ?? null)
const monogram = computed(() =>
  previewPage.value ? (previewPage.value.name || previewPage.value.path).charAt(0).toUpperCase() : '·',
)

onMounted(async () => {
  await load()
  searchInput.value?.focus()
  activePath.value = pages.value.some((page) => page.path === current.value)
    ? current.value
    : (rows.value[0]?.path ?? null)
})

// Keep the highlight on an existing row when the result set changes.
watch(rows, (list) => {
  if (!list.some((page) => page.path === activePath.value)) activePath.value = list[0]?.path ?? null
})
watch(activePath, async () => {
  await nextTick()
  listEl.value?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' })
})

// Thumbnails are regenerated in place by `mechanica thumbs`; the stamp busts
// the browser cache (and retries failures) each time the list reloads.
const thumbStamp = ref(0)
const thumbFailed = reactive(new Set<string>())
const thumbSrc = (page: PageItem) => `${pageThumbUrl(page.path)}?v=${thumbStamp.value}`
const onThumbError = (event: Event) => {
  const path = (event.target as HTMLElement).dataset.path
  if (path) thumbFailed.add(path)
}

async function load() {
  try {
    pages.value = await fetch('/@mechanica/pages').then((response) => response.json())
    thumbStamp.value = Date.now()
    thumbFailed.clear()
  } catch {
    /* dev server unavailable */
  }
}

function selectFolder(folder: string | null) {
  activeFolder.value = folder
  query.value = ''
  searchInput.value?.focus()
}

function onSearchKey(event: KeyboardEvent) {
  const list = rows.value
  if (!list.length) return
  const index = list.findIndex((page) => page.path === activePath.value)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activePath.value = list[Math.min(index + 1, list.length - 1)]!.path
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activePath.value = list[Math.max(index - 1, 0)]!.path
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const page = list[index] ?? list[0]
    if (page) open(page)
  }
}

function openPath(path: string) {
  recordRecent('pages', path)
  // In-place switch (no reload); the dialog closes once the page state landed.
  void navigation.switchPage(path).then((ok) => {
    if (ok) dialog.close()
  })
}
const open = (page: PageItem) => openPath(page.path)

function onRowMenu(event: MouseEvent, page: PageItem) {
  if (!contextMenu) return
  activePath.value = page.path
  contextMenu.openAt(event, [
    { label: 'Open', onClick: () => open(page) },
    { label: 'Rename', onClick: () => startEdit(page) },
    { label: 'Duplicate', onClick: () => startDuplicate(page) },
    {
      label: page.draft ? 'Publish' : 'Mark as draft',
      separatorBefore: true,
      onClick: () => void toggleDraft(page),
    },
    { label: 'Delete', danger: true, separatorBefore: true, onClick: () => confirmRemove(page) },
  ])
}

// ── Create / rename / duplicate (via PageFormDialog) ─────────────────────────

function startCreate() {
  dialog.open(PageFormDialog, {
    mode: 'create',
    folder: activeFolder.value,
    onSubmit: (input: { name: string; path: string }) => submitPage('create', null, input),
  })
}
function startEdit(page: PageItem) {
  dialog.open(PageFormDialog, {
    mode: 'edit',
    initialName: page.name,
    initialPath: page.path,
    onSubmit: (input: { name: string; path: string }) => submitPage('edit', page, input),
  })
}
function startDuplicate(page: PageItem) {
  dialog.open(PageFormDialog, {
    mode: 'duplicate',
    sourceName: page.name || page.path,
    initialName: `${page.name || 'Page'} copy`,
    folder: page.folderPath ?? null,
    onSubmit: (input: { name: string; path: string }) => submitPage('duplicate', page, input),
  })
}

async function submitPage(
  mode: 'create' | 'edit' | 'duplicate',
  source: PageItem | null,
  input: { name: string; path: string },
): Promise<string | null> {
  const url =
    mode === 'duplicate'
      ? `/@mechanica/pages/duplicate?path=${encodeURIComponent(source!.path)}`
      : mode === 'edit'
        ? `/@mechanica/pages?path=${encodeURIComponent(source!.path)}`
        : '/@mechanica/pages'
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) return data?.error?.path ?? 'Could not save the page'

  const nextPath = data.path ?? input.path
  // Editing the page we're on (incl. a path change) switches to it; editing
  // another page just refreshes the list. New/duplicate open the new page.
  if (mode === 'edit' && source!.path !== current.value) await load()
  else openPath(nextPath)
  return null
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
  if (page.path === current.value) openPath(pages.value[0]?.path ?? '/')
}

/** Toggle a page's draft flag (drafts drop out of queries and the export). */
async function toggleDraft(page: PageItem) {
  const response = await fetch(`/@mechanica/pages/draft?path=${encodeURIComponent(page.path)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ draft: !page.draft }),
  })
  if (response.ok) await load()
}
</script>

<style lang="scss" scoped>
.mech-pages {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 16px;
  width: 100%;
  max-width: 1200px;
  height: min(620px, 82vh);
}

// ── Card (the dialog itself) ─────────────────────────────────────────────────
.mech-pages__card {
  display: flex;
  flex-direction: column;
  flex: 0 1 840px;
  min-width: 0;
  background: var(--mech-bg);
  border-radius: 18px;
  box-shadow: var(--mech-shadow-dialog);
  overflow: hidden;
}
.mech-pages__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 14px 12px 24px;
  flex: none;
}
.mech-pages__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.mech-pages__count {
  padding: 2px 8px;
  border-radius: var(--mech-radius-pill);
  background: var(--mech-active);
  color: var(--mech-muted);
  font-size: 11.5px;
  font-weight: 600;
}
.mech-pages__close {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  width: 34px;
  height: 34px;
  border: none;
  background: none;
  color: var(--mech-muted);
  border-radius: var(--mech-radius-pill);
  cursor: pointer;

  .vicon {
    width: 18px;
    height: 18px;
  }
  &:hover {
    background: var(--mech-hover);
    color: var(--mech-fg);
  }
}

.mech-pages__toolbar {
  display: flex;
  gap: 8px;
  padding: 0 24px 14px;
  flex: none;
}
.mech-pages__search-wrap {
  position: relative;
  flex: 1;
}
.mech-pages__search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--mech-muted);
  pointer-events: none;
}
.mech-pages__search {
  width: 100%;
  padding-left: 36px;
}

// ── Content: folder rail + table ─────────────────────────────────────────────
.mech-pages__content {
  display: flex;
  gap: 14px;
  flex: 1;
  min-height: 0;
  padding: 0 24px 20px;
}
.mech-pages__rail {
  flex: none;
  width: 172px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 2px;
}
.mech-pages__rail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  background: none;
  border-radius: var(--mech-radius-sm);
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: var(--mech-fg-alt);
  cursor: pointer;

  .vicon {
    flex: none;
    width: 15px;
    height: 15px;
    color: var(--mech-muted);
  }
  &:hover {
    background: var(--mech-hover);
  }
  &.is-active {
    background: var(--mech-accent-soft);
    color: var(--mech-accent);
    font-weight: 500;

    .vicon {
      color: var(--mech-accent);
    }
  }
}
.mech-pages__rail-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-pages__rail-count {
  flex: none;
  font-size: 11px;
  color: var(--mech-placeholder);

  .mech-pages__rail-item.is-active & {
    color: var(--mech-accent);
    opacity: 0.7;
  }
}

// ── Table ────────────────────────────────────────────────────────────────────
.mech-pages__list {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
%pages-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) 96px;
  align-items: center;
  column-gap: 12px;
}
.mech-pages__thead {
  @extend %pages-grid;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 10px 8px;
  background: var(--mech-bg);
  box-shadow: 0 1px 0 var(--mech-border);

  span {
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--mech-muted);
  }
}
.mech-pages__group {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  margin-top: 10px;
  padding: 5px 10px 3px;
  border: none;
  background: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  color: var(--mech-muted);
  border-radius: var(--mech-radius-sm);
  cursor: pointer;

  .vicon {
    width: 13px;
    height: 13px;
  }
  &:hover {
    color: var(--mech-fg);
  }
}
.mech-pages__row {
  @extend %pages-grid;
  padding: 0 10px;
  height: 38px;
  border-radius: var(--mech-radius-sm);
  cursor: pointer;

  &.is-active {
    background: var(--mech-accent-soft);
  }
}
.mech-pages__cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mech-pages__name {
  font-size: 13.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-pages__badge {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mech-accent);
  background: var(--mech-bg);
  border: 1px solid currentColor;
  border-radius: var(--mech-radius-pill);
  padding: 1px 7px;

  &.is-draft {
    color: var(--mech-muted);
  }
}
.mech-pages__cell-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--mech-muted);
}
.mech-pages__actions {
  display: flex;
  justify-content: flex-end;
  gap: 1px;
  opacity: 0;

  .mech-pages__row.is-active &,
  .mech-pages__row:hover & {
    opacity: 1;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
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
.mech-pages__empty {
  padding: 24px 10px;
  margin: 0;
  color: var(--mech-muted);
  font-size: 13px;
}

// ── Side preview ─────────────────────────────────────────────────────────────
// The panel hugs the thumbnail's natural height: a short page makes a short
// card, a long page fills the dialog height and gets cropped at the bottom.
.mech-pages__preview {
  flex: none;
  align-self: flex-start;
  max-height: 100%;
  width: 320px;
  display: flex;
  flex-direction: column;
  background: var(--mech-bg);
  border-radius: 18px;
  box-shadow: var(--mech-shadow-dialog);
  overflow: hidden;
}
.mech-pages__preview-frame {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden; // crops the image bottom once the panel hits max-height
  background: var(--mech-app-bg);

  img {
    display: block;
    width: 100%;
    height: auto;
  }
}
.mech-pages__preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 16px;
  color: var(--mech-muted);

  p {
    margin: 8px 0 0;
    font-size: 13px;
    font-weight: 500;
  }
  code {
    font-size: 11.5px;
    color: var(--mech-placeholder);
  }
}
.mech-pages__preview-monogram {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--mech-radius-pill);
  background: var(--mech-active);
  font-size: 22px;
  font-weight: 600;
}
.mech-pages__preview-caption {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--mech-border);
}
.mech-pages__preview-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-pages__preview-path {
  font-size: 11.5px;
  color: var(--mech-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1160px) {
  .mech-pages__preview {
    display: none;
  }
}
</style>
