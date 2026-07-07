<template>
  <section class="shop mc-section">
    <div class="mc-container">
      <header class="shop__head">
        <span class="mc-eyebrow">{{ t.eyebrow }}</span>
        <h1 class="shop__title">{{ t.title }}</h1>
        <p class="shop__subtitle">{{ t.subtitle }}</p>
      </header>

      <div class="shop__grid">
        <Link v-for="p in props.products" :key="p.slug" :to="`/shop/${p.slug}`" class="pcard" active-class="">
          <div class="pcard__media">
            <img :src="p.image" :alt="p.title" loading="lazy" decoding="async" />
            <span v-if="p.badge" class="pcard__badge">{{ badgeOf(p.badge) }}</span>
          </div>
          <div class="pcard__body">
            <span class="pcard__cat">{{ p.categoryLabel }}</span>
            <h3 class="pcard__name">{{ p.title }}</h3>
            <p class="pcard__tagline">{{ p.tagline }}</p>
            <span class="pcard__price">{{ money(p.price, p.currency) }}</span>
          </div>
        </Link>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
// Gradient placeholder for the palette preview. Module scope (plain <script>) so
// the hoisted `defineBlock` preview data can reference it — `defineOptions`
// can't see `<script setup>` locals.
function swatch(a: string, b: string): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='${encodeURIComponent(a)}'/%3E%3Cstop offset='1' stop-color='${encodeURIComponent(b)}'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='600' height='600' fill='url(%23g)'/%3E%3C/svg%3E`
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { Link, useLocale } from 'mechanica'

// The /shop index. The store `generatePages` provider bakes the card list into
// this block's data (it already has every product), so the index needs no query.
const props = defineBlock({
  name: 'Shop index',
  category: 'Shop',
  description: 'A product grid linking to product pages (fed by the store backend)',
  props: {
    products: {
      type: 'array',
      items: {
        slug: 'string',
        title: 'string',
        tagline: 'text',
        price: { type: 'number', default: 0 },
        currency: { type: 'string', default: 'USD' },
        badge: 'string',
        categoryLabel: 'string',
        image: 'string',
      },
    },
  },
  previewData: {
    products: [
      { slug: 'arc', title: 'Arc Lounge Chair', tagline: 'A single sweeping curve.', price: 1290, currency: 'USD', badge: 'bestseller', categoryLabel: 'Seating', image: swatch('#C9B79C', '#8A5A44') },
      { slug: 'halo', title: 'Halo Floor Lamp', tagline: 'A ring of warm light.', price: 420, currency: 'USD', badge: '', categoryLabel: 'Lighting', image: swatch('#E8E4DD', '#B08D57') },
      { slug: 'pebble', title: 'Pebble Coffee Table', tagline: 'A smooth stone shape.', price: 780, currency: 'USD', badge: 'new', categoryLabel: 'Tables', image: swatch('#D8CCB4', '#B8A88C') },
      { slug: 'nimbus', title: 'Nimbus Sofa', tagline: 'Three metres of cloud.', price: 2450, currency: 'USD', badge: '', categoryLabel: 'Seating', image: swatch('#DED8CC', '#2E3138') },
      { slug: 'orbit', title: 'Orbit Pendant', tagline: 'A frosted glass globe.', price: 310, currency: 'USD', badge: '', categoryLabel: 'Lighting', image: swatch('#F2EFE9', '#B08D57') },
      { slug: 'wave', title: 'Wave Dining Table', tagline: 'A rippling oak edge.', price: 1980, currency: 'USD', badge: 'new', categoryLabel: 'Tables', image: swatch('#D2BE9C', '#7A5C3C') },
    ],
  },
})

const { locale } = useLocale()

const LABELS = {
  en: { eyebrow: 'Demo store', title: 'Shop', subtitle: 'Every product page below is generated from a third-party backend.' },
  ru: { eyebrow: 'Демо-магазин', title: 'Каталог', subtitle: 'Все страницы товаров ниже сгенерированы из стороннего бэкенда.' },
  ja: { eyebrow: 'デモストア', title: 'ショップ', subtitle: '以下の商品ページはすべて外部バックエンドから生成されています。' },
}
const t = computed(() => LABELS[locale.value as keyof typeof LABELS] ?? LABELS.en)

const BADGES = {
  en: { new: 'New', bestseller: 'Bestseller', sale: 'Sale' },
  ru: { new: 'Новинка', bestseller: 'Хит', sale: 'Скидка' },
  ja: { new: '新作', bestseller: '人気', sale: 'セール' },
}
const badgeOf = (badge: string) => {
  const map = BADGES[locale.value as keyof typeof BADGES] ?? BADGES.en
  return map[badge as keyof typeof map] ?? badge
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(locale.value || 'en', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
</script>

<style scoped>
.shop__head {
  max-width: 640px;
  margin-bottom: 44px;
}
.shop__title {
  margin-top: 12px;
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.shop__subtitle {
  margin-top: 14px;
  font-size: 18px;
  color: var(--muted);
}
.shop__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px 24px;
}
.pcard {
  display: block;
  color: inherit;
}
.pcard__media {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
}
.pcard__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}
.pcard:hover .pcard__media img {
  transform: scale(1.04);
}
.pcard__badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pcard__body {
  padding: 14px 2px 0;
}
.pcard__cat {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.pcard__name {
  margin-top: 5px;
  font-size: 18px;
  font-weight: 700;
}
.pcard__tagline {
  margin-top: 4px;
  font-size: 14px;
  color: var(--muted);
}
.pcard__price {
  display: inline-block;
  margin-top: 10px;
  font-size: 16px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .shop__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .shop__grid {
    grid-template-columns: 1fr;
    max-width: 400px;
  }
}
</style>
