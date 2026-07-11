<template>
  <section class="not-found">
    <div class="not-found__code">{{ props.code }}</div>
    <h1 class="not-found__title">{{ props.title }}</h1>
    <p v-if="props.subtitle" class="not-found__subtitle">{{ props.subtitle }}</p>
    <a class="mc-btn mc-btn--primary" :href="props.homeHref || '/'">{{ props.homeLabel }}</a>
  </section>
</template>

<script setup lang="ts">
// A standalone (whole-page) block: it only appears in the palette's "Pages"
// group while the page is still empty — never alongside content blocks.
const props = defineBlock({
  name: 'Not found page',
  standalone: true,
  icon: 'frame',
  props: {
    code: { type: 'string', default: '404' },
    title: { type: 'string', default: 'Page not found' },
    subtitle: { type: 'string', default: 'The page you are looking for does not exist or has moved.' },
    homeLabel: { type: 'string', default: 'Back to home' },
    homeHref: { type: 'string', default: '/' },
  },
  previewData: {
    code: '404',
    title: 'Page not found',
    subtitle: 'The page you are looking for does not exist or has moved.',
  },
})
</script>

<style lang="scss" scoped>
.not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 60vh;
  padding: 64px 24px;
  text-align: center;
}
.not-found__code {
  font-size: 72px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--mc-muted, #9aa1ab);
}
.not-found__title {
  margin: 0;
  font-size: 28px;
}
.not-found__subtitle {
  margin: 0 0 12px;
  max-width: 46ch;
  color: var(--mc-muted, #6b7280);
}
</style>
