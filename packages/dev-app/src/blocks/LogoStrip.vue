<template>
  <section class="logos">
    <div class="mc-container">
      <p v-if="props.label" class="logos__label">{{ props.label }}</p>
      <div class="logos__row">
        <span v-for="(logo, i) in props.items" :key="i" class="logos__item">{{ logo.name }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Logo strip',
  category: 'Marketing',
  description: 'A row of wordmarks for social proof / tech stack',
  props: {
    label: { type: 'string', default: 'Built on a modern, fast toolchain' },
    items: {
      type: 'array',
      items: { name: 'string' },
    },
  },
  previewData: {
    items: [{ name: 'Vite 8' }, { name: 'Vue 3.5' }, { name: 'Bun' }, { name: 'Vitest 4' }, { name: 'TypeScript' }],
  },
})
</script>

<style scoped>
.logos {
  padding: 40px 0;
  border-bottom: 1px solid var(--border);
}
.logos__label {
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.logos__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 16px 44px;
  margin-top: 20px;
}
.logos__item {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
  opacity: 0.55;
  transition: opacity 0.15s ease;
}
.logos__item:hover {
  opacity: 1;
}
</style>
