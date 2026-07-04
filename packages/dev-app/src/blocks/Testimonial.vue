<template>
  <section class="quote mc-section">
    <figure class="mc-container quote__inner">
      <blockquote class="quote__text">“{{ props.quote }}”</blockquote>
      <figcaption class="quote__by">
        <img v-if="props.avatar && props.avatar.src" :src="props.avatar.src" :alt="props.avatar.alt || props.author" class="quote__avatar" />
        <span v-else class="quote__avatar quote__avatar--mono">{{ initial }}</span>
        <span class="quote__meta">
          <strong class="quote__author">{{ props.author }}</strong>
          <span v-if="props.role" class="quote__role">{{ props.role }}</span>
        </span>
      </figcaption>
    </figure>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineBlock({
  name: 'Testimonial',
  category: 'Marketing',
  description: 'A pull-quote with author, role and avatar',
  props: {
    quote: { type: 'string', format: 'text', default: 'A quote from a happy user.' },
    author: { type: 'string', default: 'Jane Doe' },
    role: 'string',
    avatar: 'image',
  },
})

const initial = computed(() => (props.author || '?').charAt(0).toUpperCase())
</script>

<style scoped>
.quote {
  background: var(--surface);
}
.quote__inner {
  max-width: 820px;
  text-align: center;
}
.quote__text {
  font-size: clamp(24px, 3.4vw, 34px);
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.quote__by {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  margin-top: 32px;
}
.quote__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}
.quote__avatar--mono {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 19px;
}
.quote__meta {
  display: flex;
  flex-direction: column;
  text-align: left;
}
.quote__author {
  font-weight: 700;
}
.quote__role {
  font-size: 14px;
  color: var(--muted);
}
</style>
