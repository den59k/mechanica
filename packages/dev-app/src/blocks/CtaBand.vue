<template>
  <section :id="props.anchor || undefined" class="cta">
    <div class="mc-container cta__inner">
      <h2 class="cta__title">{{ props.title }}</h2>
      <p v-if="props.subtitle" class="cta__subtitle">{{ props.subtitle }}</p>
      <div class="cta__actions">
        <a v-if="props.primaryLabel" :href="props.primaryHref || '#'" class="mc-btn mc-btn--light">
          {{ props.primaryLabel }}
        </a>
        <code v-if="props.note" class="cta__code">{{ props.note }}</code>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'CTA band',
  category: 'Marketing',
  description: 'A bold full-width call-to-action band',
  props: {
    anchor: { type: 'string', default: 'get-started' },
    title: { type: 'string', default: 'Ship your first block today' },
    subtitle: 'text',
    primaryLabel: { type: 'string', default: 'Start building' },
    primaryHref: { type: 'string', default: '#' },
    note: 'string',
  },
})
</script>

<style scoped>
.cta {
  background:
    radial-gradient(80% 120% at 50% -20%, rgba(91, 84, 240, 0.5), transparent 60%),
    var(--ink-section);
  color: #fff;
}
.cta__inner {
  padding: 84px 24px;
  text-align: center;
}
.cta__title {
  font-size: clamp(30px, 4.4vw, 46px);
  font-weight: 800;
  letter-spacing: -0.03em;
}
.cta__subtitle {
  margin-top: 16px;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
}
.cta__actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 30px;
}
.cta__code {
  padding: 11px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  font-size: 14px;
  color: #fff;
}
</style>
