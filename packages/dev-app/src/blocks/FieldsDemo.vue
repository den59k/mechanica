<template>
  <section class="fd">
    <div class="mc-container">
      <div
        class="fd__card"
        :class="[
          `fd__card--${props.tone}`,
          `fd__card--${props.size}`,
          { 'is-bordered': props.bordered, 'is-rounded': props.rounded },
        ]"
      >
        <span class="fd__eyebrow">Field editors demo</span>
        <h2 class="fd__title">{{ props.title }}</h2>
        <p v-if="props.text" class="fd__text">{{ props.text }}</p>

        <!-- A live read-out so the dropdown + checkbox values are obvious. -->
        <div class="fd__chips">
          <span class="fd__chip">tone: <b>{{ props.tone }}</b></span>
          <span class="fd__chip">size: <b>{{ props.size }}</b></span>
          <span class="fd__chip" :class="{ 'is-off': !props.bordered }">
            {{ props.bordered ? 'bordered' : 'borderless' }}
          </span>
          <span class="fd__chip" :class="{ 'is-off': !props.rounded }">
            {{ props.rounded ? 'rounded' : 'square' }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// A self-contained example block whose look is driven entirely by a dropdown
// (enum) and two checkboxes (boolean) — a place to exercise those field editors.
const props = defineBlock({
  name: 'Field controls demo',
  category: 'Examples',
  description: 'A card driven by a dropdown (enum) and two checkboxes (boolean)',
  props: {
    title: { type: 'string', default: 'Checkboxes & dropdowns' },
    text: {
      type: 'string',
      format: 'text',
      default:
        'Open this block in the editor — the Tone and Size dropdowns and the two checkboxes restyle this card live.',
    },
    tone: {
      type: 'string',
      enum: ['neutral', 'brand', 'success', 'danger'],
      default: 'brand',
      label: 'Tone',
    },
    size: {
      type: 'string',
      enum: ['sm', 'md', 'lg'],
      default: 'md',
      label: 'Size',
    },
    bordered: { type: 'boolean', default: true, label: 'Bordered' },
    rounded: { type: 'boolean', default: true, label: 'Rounded corners' },
  },
})
</script>

<style scoped>
.fd {
  padding: 72px 0;
  background: var(--surface);
}
.fd__card {
  /* Per-tone accent, overridden by the modifiers below. */
  --fd-accent: var(--brand);
  --fd-soft: var(--brand-soft);

  max-width: 720px;
  margin: 0 auto;
  padding: 32px; /* size modifier overrides */
  border: 1px solid transparent;
  border-radius: 4px; /* `.is-rounded` overrides */
  background: var(--fd-soft);
  transition:
    padding 0.16s ease,
    border-radius 0.16s ease,
    border-color 0.16s,
    background 0.16s;
}
.fd__card.is-bordered {
  border-color: var(--fd-accent);
}
.fd__card.is-rounded {
  border-radius: 22px;
}

/* Tones */
.fd__card--neutral {
  --fd-accent: #6b7177;
  --fd-soft: #f2f3f6;
}
.fd__card--brand {
  --fd-accent: var(--brand);
  --fd-soft: var(--brand-soft);
}
.fd__card--success {
  --fd-accent: #16a34a;
  --fd-soft: #e9f7ee;
}
.fd__card--danger {
  --fd-accent: #dd2828;
  --fd-soft: #fdecec;
}

/* Sizes */
.fd__card--sm {
  padding: 22px 24px;
}
.fd__card--lg {
  padding: 52px 48px;
}

.fd__eyebrow {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fd-accent);
}
.fd__title {
  margin-top: 10px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.fd__card--sm .fd__title {
  font-size: 21px;
}
.fd__card--lg .fd__title {
  font-size: 34px;
}
.fd__text {
  margin-top: 12px;
  font-size: 16px;
  color: var(--ink-2);
}
.fd__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}
.fd__chip {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--fd-accent);
  color: var(--fd-accent);
  font-size: 13px;
  font-weight: 600;
}
.fd__chip b {
  font-weight: 800;
}
.fd__chip.is-off {
  border-color: var(--border);
  color: var(--muted);
  opacity: 0.75;
}
</style>
