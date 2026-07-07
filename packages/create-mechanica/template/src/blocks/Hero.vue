<template>
  <section class="hero">
    <div class="container hero__inner">
      <p v-if="props.eyebrow" class="hero__eyebrow">{{ props.eyebrow }}</p>
      <h1 class="hero__title">{{ props.title }}</h1>
      <p v-if="props.subtitle" class="hero__subtitle">{{ props.subtitle }}</p>
      <div v-if="props.ctaLabel" class="hero__actions">
        <a class="hero__cta" :href="props.ctaHref || '#'">{{ props.ctaLabel }}</a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Hero',
  category: 'Content',
  description: 'A page-opening headline with an optional call to action',
  props: {
    eyebrow: { type: 'string', default: '' },
    title: { type: 'string', default: 'Hello, Mechanica' },
    subtitle: 'text',
    ctaLabel: { type: 'string', default: '' },
    ctaHref: { type: 'string', default: '' },
  },
  previewData: {
    eyebrow: 'Vue 3 · Visual blocks',
    title: 'Build sites visually',
    subtitle: 'Blocks are plain Vue components — this text comes from previewData.',
    ctaLabel: 'Get started',
    ctaHref: '#',
  },
})
</script>

<style>
.hero {
  padding: 96px 0 72px;
  text-align: center;
}
.hero__eyebrow {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brand);
}
.hero__title {
  margin: 0 auto;
  max-width: 720px;
  font-size: clamp(34px, 6vw, 56px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.hero__subtitle {
  margin: 18px auto 0;
  max-width: 560px;
  font-size: 18px;
  color: var(--muted);
}
.hero__actions {
  margin-top: 30px;
}
.hero__cta {
  display: inline-block;
  padding: 12px 26px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  transition: background 0.15s;
}
.hero__cta:hover {
  background: var(--ink-2);
}
</style>
