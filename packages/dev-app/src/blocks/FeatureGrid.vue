<template>
  <section :id="props.anchor || undefined" class="features mc-section">
    <div class="mc-container">
      <div class="features__head">
        <span v-if="props.eyebrow" class="mc-eyebrow">{{ props.eyebrow }}</span>
        <h2 class="features__title">{{ props.title }}</h2>
        <p v-if="props.subtitle" class="features__subtitle">{{ props.subtitle }}</p>
      </div>

      <div class="features__grid">
        <article v-for="(item, i) in props.items" :key="i" class="feature">
          <span class="feature__icon">{{ item.icon || '◆' }}</span>
          <h3 class="feature__title">{{ item.title }}</h3>
          <p class="feature__text">{{ item.text }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Feature grid',
  category: 'Marketing',
  description: 'A heading and a grid of icon + title + text features',
  props: {
    anchor: 'string',
    eyebrow: 'string',
    title: { type: 'string', default: 'Everything is a Vue component' },
    subtitle: 'text',
    items: {
      type: 'array',
      items: { icon: 'string', title: 'string', text: 'text' },
    },
  },
  previewData: {
    eyebrow: 'Why Mechanica',
    items: [
      { icon: '🪄', title: 'Live in-browser editor', text: 'Drag, drop, nest and edit props on the real page.' },
      { icon: '🧩', title: 'Author in SFCs', text: 'A block is a Vue component that calls defineBlock.' },
      { icon: '🗂️', title: 'Scoped data', text: 'Site, folder and page data — authored once, shared correctly.' },
      { icon: '📦', title: 'Static export', text: 'Render every page to HTML with SEO head templating.' },
      { icon: '🧱', title: 'Slots & containers', text: 'Blocks nest. Drop a block inside a card or section.' },
      { icon: '⚡', title: 'Vite 8 + Bun', text: 'Source-level compile. Fast dev, fast builds.' },
    ],
  },
})
</script>

<style scoped>
.features__head {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}
.features__title {
  margin-top: 12px;
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.features__subtitle {
  margin-top: 16px;
  font-size: 18px;
  color: var(--muted);
}
.features__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 52px;
}
.feature {
  padding: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.feature:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
}
.feature__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 22px;
}
.feature__title {
  margin-top: 18px;
  font-size: 18px;
  font-weight: 700;
}
.feature__text {
  margin-top: 8px;
  font-size: 15px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .features__grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .features__grid {
    grid-template-columns: 1fr;
  }
}
</style>
