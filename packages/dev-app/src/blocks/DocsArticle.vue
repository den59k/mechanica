<template>
  <article class="doc">
    <div class="mc-container doc__inner">
      <span v-if="props.eyebrow" class="mc-eyebrow">{{ props.eyebrow }}</span>
      <h1 class="doc__title">{{ props.title }}</h1>
      <p v-if="props.lead" class="doc__lead">{{ props.lead }}</p>

      <section v-for="(section, i) in props.sections" :key="i" class="doc__section">
        <h2 v-if="section.heading" class="doc__heading">{{ section.heading }}</h2>
        <p v-if="section.body" class="doc__body">{{ section.body }}</p>
      </section>

      <!-- An internal smartLink back to the home page (its title is the label). -->
      <Link v-if="props.back?.url" :to="props.back" class="mc-btn mc-btn--ghost doc__back" />
    </div>
  </article>
</template>

<script setup lang="ts">
import { Link } from 'mechanica'

const props = defineBlock({
  name: 'Docs article',
  category: 'Marketing',
  description: 'A simple documentation article with sections and a back link',
  props: {
    eyebrow: { type: 'string', default: 'Documentation' },
    title: { type: 'string', default: 'Getting started' },
    lead: {
      type: 'string',
      format: 'text',
      default: 'Everything you need to build and ship a site with Mechanica.',
    },
    sections: {
      type: 'array',
      default: [
        { heading: 'Install', body: 'Run bun install, then start the dev server with bun run dev.' },
        { heading: 'Author a block', body: 'A block is a Vue SFC whose script setup calls defineBlock.' },
      ],
      items: {
        type: 'object',
        properties: { heading: 'string', body: { type: 'string', format: 'text' } },
      },
    },
    back: 'smartLink',
  },
})
</script>

<style scoped>
.doc {
  padding: 88px 0;
  background: var(--bg);
}
.doc__inner {
  max-width: 760px;
}
.doc__title {
  margin-top: 14px;
  font-size: clamp(32px, 5vw, 46px);
  font-weight: 800;
  letter-spacing: -0.03em;
}
.doc__lead {
  margin-top: 16px;
  font-size: 18px;
  color: var(--muted);
}
.doc__section {
  margin-top: 36px;
}
.doc__heading {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.doc__body {
  margin-top: 8px;
  font-size: 16px;
  color: var(--ink-2);
}
.doc__back {
  margin-top: 44px;
}
</style>
