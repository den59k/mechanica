<template>
  <section :id="props.anchor || undefined" class="pricing mc-section">
    <div class="mc-container">
      <div class="pricing__head">
        <span v-if="props.eyebrow" class="mc-eyebrow">{{ props.eyebrow }}</span>
        <h2 class="pricing__title">{{ props.title }}</h2>
        <p v-if="props.subtitle" class="pricing__subtitle">{{ props.subtitle }}</p>
      </div>

      <div class="pricing__grid">
        <article
          v-for="(plan, i) in props.plans"
          :key="i"
          class="plan"
          :class="{ 'plan--featured': plan.featured }"
        >
          <span v-if="plan.featured" class="plan__badge">Most popular</span>
          <h3 class="plan__name">{{ plan.name }}</h3>
          <div class="plan__price">
            <span class="plan__amount">{{ plan.price }}</span>
            <span v-if="plan.period" class="plan__period">{{ plan.period }}</span>
          </div>
          <p v-if="plan.description" class="plan__desc">{{ plan.description }}</p>
          <ul class="plan__features">
            <li v-for="(f, j) in plan.features" :key="j" class="plan__feature">{{ f.text }}</li>
          </ul>
          <a
            :href="plan.ctaHref || '#'"
            class="mc-btn"
            :class="plan.featured ? 'mc-btn--primary' : 'mc-btn--ghost'"
          >
            {{ plan.ctaLabel || 'Choose plan' }}
          </a>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Pricing',
  category: 'Marketing',
  description: 'Tiered pricing plans with feature lists',
  props: {
    anchor: 'string',
    eyebrow: 'string',
    title: { type: 'string', default: 'Start free. Scale when you ship.' },
    subtitle: 'text',
    plans: {
      type: 'array',
      items: {
        name: 'string',
        price: 'string',
        period: 'string',
        description: 'text',
        features: { type: 'array', items: { text: 'string' } },
        ctaLabel: 'string',
        ctaHref: 'string',
        featured: 'boolean',
      },
    },
  },
  previewData: {
    eyebrow: 'Pricing',
    subtitle: 'The editor and static export are open source. Hosted rendering is on the way.',
    plans: [
      {
        name: 'Open source',
        price: '$0',
        period: 'forever',
        description: 'Everything you need to build and export a site.',
        features: [{ text: 'Visual block editor' }, { text: 'Static site export' }, { text: 'MIT licensed' }],
        ctaLabel: 'Get started',
      },
      {
        name: 'Team',
        price: '$19',
        period: '/ editor / mo',
        description: 'Collaboration and hosted rendering for growing teams.',
        features: [{ text: 'Hosted SSR rendering' }, { text: 'Shared asset library' }, { text: 'Roles & review' }],
        ctaLabel: 'Start free trial',
        featured: true,
      },
      {
        name: 'Enterprise',
        price: "Let's talk",
        description: 'Security, SSO and support for large organizations.',
        features: [{ text: 'SSO & audit logs' }, { text: 'Priority support' }, { text: 'On-prem option' }],
        ctaLabel: 'Contact sales',
      },
    ],
  },
})
</script>

<style scoped>
.pricing__head {
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}
.pricing__title {
  margin-top: 12px;
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.pricing__subtitle {
  margin-top: 16px;
  font-size: 18px;
  color: var(--muted);
}
.pricing__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 52px;
  align-items: stretch;
}
.plan {
  display: flex;
  flex-direction: column;
  padding: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}
.plan--featured {
  border-color: transparent;
  box-shadow: 0 0 0 2px var(--brand), var(--shadow-lg);
  transform: translateY(-6px);
}
.plan__badge {
  align-self: flex-start;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.plan__name {
  margin-top: 14px;
  font-size: 17px;
  font-weight: 700;
  color: var(--muted);
}
.plan__price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 10px;
}
.plan__amount {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.plan__period {
  font-size: 15px;
  color: var(--muted);
}
.plan__desc {
  margin-top: 12px;
  font-size: 15px;
  color: var(--muted);
}
.plan__features {
  display: flex;
  flex-direction: column;
  gap: 11px;
  margin: 22px 0 28px;
}
.plan__feature {
  position: relative;
  padding-left: 26px;
  font-size: 15px;
}
.plan__feature::before {
  content: '✓';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--brand);
  font-weight: 700;
}
.plan .mc-btn {
  margin-top: auto;
  width: 100%;
}

@media (max-width: 900px) {
  .pricing__grid {
    grid-template-columns: 1fr;
    max-width: 440px;
    margin-inline: auto;
  }
  .plan--featured {
    transform: none;
  }
}
</style>
