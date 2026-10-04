<template>
  <div v-if="config" class="mech-locale">
    <button
      ref="triggerRef"
      type="button"
      class="mech-locale__pill"
      :class="{ 'is-fallback': isFallback }"
      :title="isFallback ? `Not translated to ${label(current)} yet` : `Language: ${label(current)}`"
      @click="open = !open"
    >
      <VIcon name="globe" class="mech-locale__globe" />
      <span class="mech-locale__label">{{ label(current) }}</span>
      <span v-if="isFallback" class="mech-locale__badge">untranslated</span>
      <VIcon name="chevron-down" class="mech-locale__chev" />
    </button>

    <VPopover v-model:open="open" :anchor="triggerRef" :offset="6" panel-class="mech-locale__pop">
      <div class="mech-locale__menu">
        <button
          v-for="code in config.all"
          :key="code"
          type="button"
          class="mech-locale__item"
          :class="{ 'is-current': code === current }"
          :disabled="busy"
          @click="choose(code)"
        >
          <span class="mech-locale__name">{{ label(code) }}</span>
          <span class="mech-locale__meta">
            <template v-if="isPresent(code)">
              <VIcon v-if="code === current" name="check" class="mech-locale__tick" />
              <span v-else class="mech-locale__dot" title="Translated" />
            </template>
            <span v-else class="mech-locale__create">Create</span>
          </span>
        </button>
      </div>
    </VPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import {
  parseLocalePath,
  localePath,
  localeLabel,
  type LocalesConfig,
  type State,
} from 'mechanica-shared'
import VIcon from './VIcon.vue'
import VPopover from './VPopover.vue'
import { navigationKey, fallbackNavigation } from '../lib/navigation'
import { editorBackend } from '../lib/backend'

const navigation = inject(navigationKey, null) ?? fallbackNavigation()

// The site's locale config rides the injected page state (i18n off → null,
// and this whole control renders nothing).
const config = ((window as { state?: State }).state?.locales ?? null) as LocalesConfig | null

const triggerRef = ref<HTMLElement | null>(null)
const open = ref(false)
const busy = ref(false)
// Which locales the current logical page has a translation for (default incl.).
const available = ref<string[]>([])

const parsed = computed(() => parseLocalePath(navigation.path.value, config))
const current = computed(() => parsed.value.locale || config?.default || '')
const logicalPath = computed(() => parsed.value.path)
// A fallback view: the current locale has no file, we're showing the default.
const isFallback = computed(
  () => !!config && current.value !== config.default && !available.value.includes(current.value),
)

const label = (code: string) => localeLabel(config, code)
// A locale is "present" when it has a real file — the default always does; a
// non-default one only once translated (the current fallback locale is not).
const isPresent = (code: string) => code === config?.default || available.value.includes(code)

/** Refresh which translations the current page has, from the pages listing. */
async function refresh(): Promise<void> {
  if (!config) return
  try {
    const pages = await editorBackend().pages.list()
    available.value = pages.find((p) => p.path === logicalPath.value)?.locales ?? [config.default]
  } catch {
    available.value = [config.default]
  }
}

watch(logicalPath, refresh, { immediate: true })

async function choose(code: string): Promise<void> {
  if (busy.value) return
  open.value = false
  const needsCreate = !isPresent(code)
  // Already viewing this locale and it exists — nothing to do.
  if (code === current.value && !needsCreate) return

  // A locale we don't have yet — create the translation first (seeded from the
  // default-locale content), then switch to it.
  if (needsCreate) {
    busy.value = true
    try {
      await editorBackend().pages.createTranslation(logicalPath.value, code)
      await refresh()
    } catch {
      busy.value = false
      return
    }
    busy.value = false
  }

  const target = localePath(logicalPath.value, code, config)
  // Materializing the locale we're already viewing as a fallback: the URL is
  // unchanged, so a full reload is the honest way to pick up the new file.
  if (target === navigation.path.value) location.reload()
  else void navigation.switchPage(target)
}
</script>

<style lang="scss" scoped>
.mech-locale {
  margin-top: 8px;
}
.mech-locale__pill {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  color: var(--mech-fg);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s;

  &:hover {
    border-color: var(--mech-border-strong);
  }
  &.is-fallback {
    border-color: var(--mech-warning, #d9822b);
    background: color-mix(in srgb, var(--mech-warning, #d9822b) 8%, var(--mech-bg));
  }
}
.mech-locale__globe {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
}
.mech-locale__label {
  font-weight: 600;
}
.mech-locale__badge {
  flex: none;
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mech-warning, #d9822b) 18%, transparent);
  color: var(--mech-warning, #a5641f);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.mech-locale__chev {
  flex: none;
  margin-left: auto;
  width: 14px;
  height: 14px;
  color: var(--mech-muted);

  .mech-locale__badge + & {
    margin-left: 4px;
  }
}
.mech-locale__menu {
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mech-locale__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--mech-radius-sm);
  background: transparent;
  color: var(--mech-fg);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--mech-accent-soft);
  }
  &.is-current {
    font-weight: 600;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.mech-locale__meta {
  display: inline-flex;
  align-items: center;
}
.mech-locale__tick {
  width: 15px;
  height: 15px;
  color: var(--mech-accent);
}
.mech-locale__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--mech-accent);
}
.mech-locale__create {
  color: var(--mech-muted);
  font-size: 11px;
}
</style>
