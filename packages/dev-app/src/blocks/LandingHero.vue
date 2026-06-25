<template>
  <section class="hero">
    <div class="mc-container hero__inner">
      <span v-if="props.eyebrow" class="mc-eyebrow">{{ props.eyebrow }}</span>
      <h1 class="hero__title">{{ props.title }}</h1>
      <p v-if="props.subtitle" class="hero__subtitle">{{ props.subtitle }}</p>

      <div class="hero__actions">
        <a v-if="props.primaryLabel" :href="props.primaryHref || '#'" class="mc-btn mc-btn--primary">
          {{ props.primaryLabel }}
        </a>
        <!-- A smartLink carries its own display text (its title), so the link
             label comes from the link itself — no separate label prop. -->
        <Link v-if="props.secondary?.url" :to="props.secondary" class="mc-btn mc-btn--ghost" />
      </div>

      <p v-if="props.note" class="hero__note">{{ props.note }}</p>

      <!-- A stylised editor mock — pure CSS, no asset needed. -->
      <div class="hero__mock" aria-hidden="true">
        <div class="mock__bar">
          <span></span><span></span><span></span>
        </div>
        <div class="mock__body">
          <div class="mock__canvas">
            <div class="mock__block mock__block--lg"></div>
            <div class="mock__block"></div>
            <div class="mock__grid">
              <div class="mock__cell"></div>
              <div class="mock__cell"></div>
              <div class="mock__cell"></div>
            </div>
          </div>
          <div class="mock__panel">
            <div class="mock__tile"></div>
            <div class="mock__tile"></div>
            <div class="mock__tile"></div>
            <div class="mock__tile"></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Link } from 'mechanica'

const props = defineBlock({
  name: 'Hero',
  category: 'Marketing',
  description: 'Headline, subtitle, CTAs and a product mock',
  props: {
    eyebrow: { type: 'string', default: 'Vite 8 · Vue 3.5 · Bun' },
    title: { type: 'string', default: 'Build Vue sites with a visual block editor' },
    subtitle: 'text',
    primaryLabel: { type: 'string', default: 'Start building' },
    primaryHref: { type: 'string', default: '#get-started' },
    secondary: 'smartLink',
    note: 'string',
  },
})
</script>

<style scoped>
.hero {
  position: relative;
  padding: 96px 0 80px;
  background:
    radial-gradient(60% 60% at 50% 0%, var(--brand-soft), transparent 70%),
    var(--bg);
  overflow: hidden;
}
.hero__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.hero__title {
  max-width: 16ch;
  margin-top: 18px;
  font-size: clamp(38px, 6vw, 64px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.hero__subtitle {
  max-width: 56ch;
  margin-top: 22px;
  font-size: clamp(17px, 2.2vw, 20px);
  color: var(--muted);
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}
.hero__note {
  margin-top: 16px;
  font-size: 13.5px;
  color: var(--muted);
}

/* Product mock */
.hero__mock {
  width: 100%;
  max-width: 960px;
  margin-top: 64px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.mock__bar {
  display: flex;
  gap: 7px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.mock__bar span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #d6d8e2;
}
.mock__body {
  display: grid;
  grid-template-columns: 1fr 188px;
  gap: 16px;
  padding: 18px;
  min-height: 280px;
}
.mock__canvas {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mock__block {
  height: 56px;
  border-radius: 10px;
  background: var(--surface);
}
.mock__block--lg {
  height: 116px;
  background: linear-gradient(120deg, var(--brand-soft), var(--surface));
}
.mock__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.mock__cell {
  height: 78px;
  border-radius: 10px;
  background: var(--surface);
}
.mock__panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface);
}
.mock__tile {
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  aspect-ratio: 1 / 1;
}

@media (max-width: 720px) {
  .mock__body {
    grid-template-columns: 1fr;
  }
  .mock__panel {
    display: none;
  }
}
</style>
