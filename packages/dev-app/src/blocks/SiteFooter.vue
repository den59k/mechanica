<template>
  <footer class="footer">
    <div class="mc-container footer__inner">
      <div class="footer__brand">
        <strong class="footer__name">{{ props.brand || 'Mechanica' }}</strong>
        <p v-if="props.note" class="footer__note">{{ props.note }}</p>
      </div>
      <nav class="footer__links">
        <a v-for="(item, i) in props.links" :key="i" :href="item.href || '#'" class="footer__link">
          {{ item.label }}
        </a>
      </nav>
    </div>
    <div class="mc-container footer__bottom">
      <span>{{ props.copyright }}</span>
    </div>
  </footer>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Footer',
  category: 'Marketing',
  description: 'Site footer: brand, links and a copyright line',
  props: {
    brand: 'string',
    note: 'text',
    links: {
      type: 'array',
      items: { label: 'string', href: 'string' },
    },
    copyright: { type: 'string', default: '© 2026 Mechanica' },
  },
})
</script>

<style scoped>
.footer {
  background: var(--ink-section);
  color: rgba(255, 255, 255, 0.72);
}
.footer__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 56px 24px 28px;
}
.footer__name {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}
.footer__note {
  margin-top: 8px;
  font-size: 14px;
  max-width: 34ch;
}
.footer__links {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
}
.footer__link {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.72);
  transition: color 0.15s ease;
}
.footer__link:hover {
  color: #fff;
}
.footer__bottom {
  padding: 20px 24px 40px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
