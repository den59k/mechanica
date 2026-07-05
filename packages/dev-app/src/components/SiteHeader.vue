<template>
  <header class="nav">
    <div class="mc-container nav__inner">
      <a class="nav__brand" :href="nav.homeHref || '/'">{{ nav.brand || 'Mechanica' }}</a>

      <nav class="nav__links">
        <a v-for="(item, i) in nav.links || []" :key="i" :href="item.href || '#'" class="nav__link">
          {{ item.label }}
        </a>
      </nav>

      <LanguageSwitcher class="nav__lang" />

      <a v-if="nav.ctaLabel" :href="nav.ctaHref || '#'" class="mc-btn mc-btn--primary mc-btn--sm">
        {{ nav.ctaLabel }}
      </a>
    </div>
  </header>
</template>

<script setup lang="ts">
// Shared site header: reads the `navbar` data entry. Not a block — it's identical
// on every page, so App.vue renders it once, outside the page content.
import { useNavbar } from '../data/navbar'
import LanguageSwitcher from './LanguageSwitcher.vue'

const nav = useNavbar()
</script>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: saturate(160%) blur(12px);
  border-bottom: 1px solid var(--border);
}
.nav__inner {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 64px;
}
.nav__brand {
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.02em;
}
.nav__links {
  display: flex;
  align-items: center;
  gap: 28px;
  margin-left: auto;
}
.nav__link {
  font-size: 15px;
  font-weight: 500;
  color: var(--muted);
  transition: color 0.15s ease;
}
.nav__link:hover {
  color: var(--ink);
}
.nav__lang {
  margin-left: 2px;
}
.nav .mc-btn {
  margin-left: 4px;
}

@media (max-width: 720px) {
  .nav__links {
    display: none;
  }
  .nav__inner {
    justify-content: space-between;
  }
  .nav__lang {
    margin-left: auto;
  }
  .nav .mc-btn {
    margin-left: 0;
  }
}
</style>
