<template>
  <nav v-if="enabled" class="lang" aria-label="Language">
    <Link
      v-for="code in codes"
      :key="code"
      :to="page.path!"
      :locale="code"
      class="lang__item"
      :class="{ 'is-active': code === locale }"
    >
      {{ label(code) }}
    </Link>
  </nav>
</template>

<script setup lang="ts">
// A site-facing language switcher: one link per site locale, each pointing at
// the current logical page in that language. `<Link :locale>` prefixes the URL
// (`/ru/about`), and `page.path` stays logical, so the switcher works on every
// page with no per-page config. On a single-language site `enabled` is false
// and this renders nothing.
import { Link, useLocale, usePageData } from 'mechanica'

const { config, locale, enabled } = useLocale()
const page = usePageData()

const codes = config?.all ?? []
const label = (code: string) => config?.labels?.[code] ?? code.toUpperCase()
</script>

<style scoped>
.lang {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.lang__item {
  padding: 4px 9px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
  transition:
    color 0.15s ease,
    background 0.15s ease;
}
.lang__item:hover {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 6%, transparent);
}
.lang__item.is-active {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 9%, transparent);
}
</style>
