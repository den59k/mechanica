<template>
  <header class="nav">
    <div class="mc-container nav__inner">
      <a class="nav__brand" :href="props.homeHref || '#'">{{ brand }}</a>

      <nav class="nav__links">
        <a v-for="(item, i) in props.links" :key="i" :href="item.href || '#'" class="nav__link">
          {{ item.label }}
        </a>
      </nav>

      <a v-if="props.ctaLabel" :href="props.ctaHref || '#'" class="mc-btn mc-btn--primary mc-btn--sm">
        {{ props.ctaLabel }}
      </a>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSiteSettings } from '../data/site'

// Reads site-scoped data for a sensible brand fallback — a block consuming
// shared data, not just its own props.
const site = useSiteSettings()

const props = defineBlock({
  name: 'Navbar',
  category: 'Marketing',
  description: 'Sticky top bar: brand, nav links, primary CTA',
  props: {
    brand: 'string',
    homeHref: { type: 'string', default: '#' },
    links: {
      type: 'array',
      items: { label: 'string', href: 'string' },
    },
    ctaLabel: { type: 'string', default: 'Get started' },
    ctaHref: { type: 'string', default: '#get-started' },
  },
})

const brand = computed(() => props.brand || site.name || 'Mechanica')
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
  .nav .mc-btn {
    margin-left: auto;
  }
}
</style>
