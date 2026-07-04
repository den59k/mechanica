<template>
  <Link v-if="hasTarget" :to="link!" class="ui-button" :class="`ui-button--${variant ?? 'primary'}`">
    {{ label ?? 'Button' }}
  </Link>
  <button v-else type="button" class="ui-button" :class="`ui-button--${variant ?? 'primary'}`">
    {{ label ?? 'Button' }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Link } from 'mechanica'

// The site's own button — a plain component exposed to the Block Composer via
// src/composer.ts. Rendering through the runtime `Link` keeps editor
// link-following and SPA routing working when it carries a link.
const props = defineProps<{
  label?: string
  link?: string | { url?: string }
  variant?: 'primary' | 'secondary' | 'ghost'
}>()

const hasTarget = computed(() => (typeof props.link === 'string' ? props.link !== '' : !!props.link?.url))
</script>

<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 999px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.ui-button:hover {
  opacity: 0.88;
}
/* Black pill primary, matching the design system's primary action. */
.ui-button--primary {
  background: #111;
  color: #fff;
}
.ui-button--secondary {
  background: transparent;
  border-color: rgba(0, 0, 0, 0.16);
  color: #111;
}
.ui-button--ghost {
  background: transparent;
  color: #111;
}
</style>
