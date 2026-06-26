<template>
  <div class="mech-smartlink">
    <div class="mech-smartlink__row">
      <!-- Target: search internal pages, or fall back to an external URL. The
           choice sets `external` automatically — there is no manual checkbox. -->
      <div ref="anchorEl" class="mech-smartlink__combo" :class="{ 'is-open': open }">
        <input
          ref="inputEl"
          class="mech-smartlink__input"
          type="text"
          :value="inputText"
          :placeholder="placeholder"
          @focus="onFocus"
          @input="onInput"
          @keydown.down.prevent="onArrow(1)"
          @keydown.up.prevent="onArrow(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.esc="close()"
        />
        <span v-if="kind" class="mech-smartlink__kind" :class="`is-${kind}`">
          {{ kind === 'external' ? 'External' : 'Page' }}
        </span>
        <button
          v-if="hasValue"
          type="button"
          class="mech-smartlink__clear"
          title="Clear link"
          @click="clear"
        >
          <VIcon name="close" />
        </button>
        <VIcon name="chevron-down" class="mech-smartlink__chevron" />

        <VPopover
          :open="open"
          :anchor="anchorEl"
          match-width
          panel-class="mech-smartlink__menu"
          @update:open="open = $event"
        >
          <div role="listbox">
            <div v-if="pageMatches.length" class="mech-smartlink__group">Pages</div>
            <button
              v-for="(page, index) in pageMatches"
              :key="page.path"
              type="button"
              class="mech-smartlink__option"
              :class="{ 'is-active': index === active }"
              role="option"
              @click="selectPage(page)"
              @pointermove="active = index"
            >
              <span class="mech-smartlink__opt-name">{{ page.name || page.path }}</span>
              <span class="mech-smartlink__opt-path">{{ page.path }}</span>
            </button>

            <button
              v-if="showExternal"
              type="button"
              class="mech-smartlink__option mech-smartlink__option--ext"
              :class="{ 'is-active': active === pageMatches.length }"
              role="option"
              @click="selectExternal"
              @pointermove="active = pageMatches.length"
            >
              <span class="mech-smartlink__opt-name">Link to external URL</span>
              <span class="mech-smartlink__opt-path">{{ query.trim() }}</span>
            </button>

            <p v-if="!pageMatches.length && !showExternal" class="mech-smartlink__empty">
              {{ pages.length ? 'No pages match. Type a URL for an external link.' : 'Type a URL for an external link.' }}
            </p>
          </div>
        </VPopover>
      </div>

      <!-- Reveal the secondary settings (title, new tab). A dot marks active
           options while collapsed. -->
      <button
        type="button"
        class="mech-smartlink__more"
        :class="{ 'is-active': expanded }"
        :title="expanded ? 'Hide link options' : 'Link options'"
        aria-label="Link options"
        @click="expanded = !expanded"
      >
        <VIcon name="ellipsis" />
        <span v-if="!expanded && value.openNewTab" class="mech-smartlink__dot" />
      </button>
    </div>

    <Transition name="mech-smartlink-reveal">
      <div v-if="expanded" class="mech-smartlink__options">
        <!-- Visible link text. Auto-filled when an internal page is chosen. -->
        <label class="mech-smartlink__title">
          <span class="mech-smartlink__sub">Title</span>
          <input
            class="mech-input"
            type="text"
            :value="value.title"
            :placeholder="kind === 'page' ? 'Shown as the link text' : 'Link text'"
            @input="patch('title', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="mech-checkbox mech-smartlink__newtab">
          <input
            type="checkbox"
            :checked="value.openNewTab"
            @change="patch('openNewTab', ($event.target as HTMLInputElement).checked)"
          />
          <span>Open in new tab</span>
        </label>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { fetchPages, filterPages, type PageItem } from '../../lib/page-list'
import VPopover from '../../components/VPopover.vue'
import VIcon from '../../components/VIcon.vue'

interface LinkValue {
  url: string
  title: string
  external?: boolean
  openNewTab?: boolean
}

const props = defineProps<{ modelValue?: Partial<LinkValue>; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [LinkValue] }>()

const value = computed<LinkValue>(() => ({
  url: '',
  title: '',
  external: false,
  openNewTab: false,
  ...props.modelValue,
}))

const hasValue = computed(() => !!value.value.url)
const kind = computed<'page' | 'external' | null>(() =>
  !value.value.url ? null : value.value.external ? 'external' : 'page',
)

// Extra settings start revealed when the link already carries non-default ones.
const expanded = ref(Boolean(value.value.external || value.value.openNewTab))

// Pages for autocomplete: injected (tests), else fetched from the dev server.
const injectedPages = inject<PageItem[] | null>('mechPages', null)
const pages = ref<PageItem[]>(injectedPages ?? [])
if (!injectedPages) void fetchPages().then((list) => (pages.value = list))

const anchorEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const open = ref(false)
const close = () => (open.value = false)

const query = ref('')
const active = ref(-1)

// Idle, the input shows the committed target (path or URL); open, it shows the
// live search query.
const inputText = computed(() => (open.value ? query.value : value.value.url))
const placeholder = computed<string>(() => props.schema.placeholder ?? 'Search pages or paste a URL…')

const pageMatches = computed(() => filterPages(pages.value, query.value).slice(0, 8))
const showExternal = computed(() => query.value.trim().length > 0)

function patch(key: keyof LinkValue, val: unknown) {
  emit('update:modelValue', { ...value.value, [key]: val })
}

function onFocus() {
  query.value = value.value.url
  active.value = -1
  open.value = true
  inputEl.value?.select()
}
function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  active.value = -1
  open.value = true
}
function onArrow(delta: number) {
  if (!open.value) {
    open.value = true
    return
  }
  const count = pageMatches.value.length + (showExternal.value ? 1 : 0)
  if (count) active.value = (active.value + delta + count) % count
}
function onEnter() {
  if (active.value >= 0 && active.value < pageMatches.value.length) {
    selectPage(pageMatches.value[active.value]!)
  } else if (showExternal.value) {
    selectExternal()
  }
}

/** Internal page → store its path + auto-fill the title with the page name. */
function selectPage(page: PageItem) {
  emit('update:modelValue', {
    ...value.value,
    url: page.path,
    title: page.name || page.path,
    external: false,
  })
  close()
}
/** External URL → store the typed text, flag it external, and reveal the title. */
function selectExternal() {
  emit('update:modelValue', { ...value.value, url: query.value.trim(), external: true })
  expanded.value = true
  close()
}
function clear() {
  emit('update:modelValue', { url: '', title: '', external: false, openNewTab: value.value.openNewTab })
  query.value = ''
}
</script>

<style lang="scss" scoped>
.mech-smartlink {
  display: flex;
  flex-direction: column;
}
.mech-smartlink__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

// Combobox — a filled field that holds the input plus the kind badge, clear and
// chevron. Lifts to white with an accent ring while open / focused.
.mech-smartlink__combo {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
  border: 1px solid transparent;
  border-radius: var(--mech-radius);
  background: var(--mech-field-bg);
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;

  &:hover {
    background: var(--mech-field-bg-hover);
  }
  &.is-open,
  &:focus-within {
    background: var(--mech-bg);
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 3px var(--mech-ring);
  }
}
.mech-smartlink__input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 4px 0 12px;
  border: none;
  background: none;
  font: inherit;
  font-size: 13.5px;
  color: var(--mech-fg);

  &::placeholder {
    color: var(--mech-placeholder);
  }
  &:focus {
    outline: none;
  }
}
.mech-smartlink__kind {
  flex: none;
  padding: 2px 7px;
  border-radius: var(--mech-radius-pill);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  &.is-page {
    color: var(--mech-accent);
    background: var(--mech-accent-soft);
  }
  &.is-external {
    color: var(--mech-muted);
    background: var(--mech-active);
  }
}
.mech-smartlink__clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  border-radius: var(--mech-radius-sm);
  color: var(--mech-muted);
  cursor: pointer;

  .vicon {
    width: 13px;
    height: 13px;
  }
  &:hover {
    background: var(--mech-hover);
    color: var(--mech-fg);
  }
}
.mech-smartlink__chevron {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
  transition: transform 0.16s ease;
}
.mech-smartlink__combo.is-open .mech-smartlink__chevron {
  transform: rotate(180deg);
}

// The "more settings" toggle — a square icon button matching the field height.
.mech-smartlink__more {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid transparent;
  border-radius: var(--mech-radius);
  background: var(--mech-field-bg);
  color: var(--mech-muted);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;

  .vicon {
    width: 16px;
    height: 16px;
  }
  &:hover {
    background: var(--mech-field-bg-hover);
    color: var(--mech-fg);
  }
  &.is-active {
    background: var(--mech-accent-soft);
    color: var(--mech-accent);
  }
}
.mech-smartlink__dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mech-accent);
}

.mech-smartlink__group {
  padding: 5px 8px 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mech-muted);
}
.mech-smartlink__option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  text-align: left;
  cursor: pointer;
  font: inherit;

  &.is-active {
    background: var(--mech-hover);
  }
}
.mech-smartlink__option--ext {
  margin-top: 2px;

  .mech-smartlink__opt-name {
    color: var(--mech-accent);
  }
}
.mech-smartlink__opt-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--mech-fg);
}
.mech-smartlink__opt-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mech-muted);
}
.mech-smartlink__empty {
  padding: 10px;
  margin: 0;
  font-size: 12.5px;
  color: var(--mech-muted);
}

// Revealed secondary settings — a faint left rail (matching nested groups)
// ties them to the link above so they read as one block, not loose fields.
.mech-smartlink__options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  margin-left: 6px;
  padding-left: 14px;
  border-left: 1px solid var(--mech-border);
}
.mech-smartlink__title {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.mech-smartlink__sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--mech-muted);
}
.mech-smartlink-reveal-enter-active,
.mech-smartlink-reveal-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.mech-smartlink-reveal-enter-from,
.mech-smartlink-reveal-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
