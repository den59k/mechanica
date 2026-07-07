<template>
  <section class="product mc-section">
    <div class="mc-container product__inner">
      <div class="product__gallery">
        <img class="product__hero" :src="hero" :alt="props.title" loading="eager" decoding="async" />
        <div v-if="props.gallery.length > 1" class="product__thumbs">
          <button
            v-for="(g, i) in props.gallery"
            :key="i"
            type="button"
            class="product__thumb"
            :class="{ 'is-active': g === hero }"
            @click="active = g"
          >
            <img :src="g" :alt="`${props.title} ${i + 1}`" loading="lazy" />
          </button>
        </div>
      </div>

      <div class="product__info">
        <div class="product__eyebrow">
          <span class="mc-eyebrow">{{ props.categoryLabel }}</span>
          <span v-if="props.badge" class="product__badge">{{ badgeLabel }}</span>
        </div>
        <h1 class="product__title">{{ props.title }}</h1>
        <p class="product__tagline">{{ props.tagline }}</p>

        <div class="product__price">
          <span class="product__amount">{{ money(props.price) }}</span>
          <span v-if="props.compareAtPrice > 0" class="product__compare">{{ money(props.compareAtPrice) }}</span>
        </div>

        <p class="product__desc">{{ props.description }}</p>

        <dl class="product__specs">
          <div><dt>{{ t.material }}</dt><dd>{{ props.material }}</dd></div>
          <div><dt>{{ t.dimensions }}</dt><dd>{{ props.dimensions }}</dd></div>
          <div><dt>{{ t.rating }}</dt><dd>★ {{ props.rating }} · {{ props.reviews }} {{ t.reviews }}</dd></div>
          <div><dt>{{ t.stock }}</dt><dd>{{ props.stock }}</dd></div>
        </dl>

        <div v-if="props.colors.length" class="product__colors">
          <span v-for="(c, i) in props.colors" :key="i" class="product__swatch" :style="{ background: c }" :title="c" />
        </div>

        <div class="product__actions">
          <button class="mc-btn mc-btn--primary" type="button">{{ t.add }}</button>
          <Link to="/shop" class="mc-btn mc-btn--ghost">← {{ t.all }}</Link>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
// A self-contained gradient placeholder for the palette preview (no network).
// Module scope (plain <script>) so the hoisted `defineBlock` preview data can
// reference it — `defineOptions` can't see `<script setup>` locals.
function swatch(a: string, b: string): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='${encodeURIComponent(a)}'/%3E%3Cstop offset='1' stop-color='${encodeURIComponent(b)}'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='800' fill='url(%23g)'/%3E%3C/svg%3E`
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Link, useLocale } from 'mechanica'

// A single product page. Rendered by the `generatePages` store provider (one per
// product × locale); the block itself is data-driven, so it also previews on its
// own with `previewData` below. Content strings arrive already translated; the
// static UI labels are localized here off the current page locale.
const props = defineBlock({
  name: 'Product',
  category: 'Shop',
  description: 'A product page — gallery, price, specs (fed by the store backend)',
  props: {
    title: { type: 'string', default: 'Product' },
    tagline: 'text',
    description: 'text',
    badge: 'string',
    categoryLabel: 'string',
    price: { type: 'number', default: 0 },
    currency: { type: 'string', default: 'USD' },
    compareAtPrice: { type: 'number', default: 0 },
    rating: { type: 'number', default: 0 },
    reviews: { type: 'number', default: 0 },
    stock: { type: 'number', default: 0 },
    material: 'string',
    dimensions: 'string',
    colors: { type: 'array', items: 'string' },
    image: 'string',
    gallery: { type: 'array', items: 'string' },
  },
  previewData: {
    title: 'Arc Lounge Chair',
    tagline: 'A single sweeping curve, made to sink into.',
    description:
      'The Arc pairs a steam-bent oak frame with a deep bouclé seat, so its silhouette stays light while the cushion swallows you whole. Handmade to order.',
    badge: 'bestseller',
    categoryLabel: 'Seating',
    price: 1290,
    currency: 'USD',
    rating: 4.8,
    reviews: 214,
    stock: 12,
    material: 'Steam-bent oak · bouclé',
    dimensions: '72 × 78 × 90 cm',
    colors: ['#C9B79C', '#3E4A3D', '#8A5A44'],
    image: swatch('#C9B79C', '#8A5A44'),
    gallery: [swatch('#C9B79C', '#8A5A44'), swatch('#3E4A3D', '#6E5A3E'), swatch('#8A5A44', '#2E3138')],
  },
})

const { locale } = useLocale()

const active = ref('')
const hero = computed(() => active.value || props.gallery[0] || props.image)

const LABELS = {
  en: { material: 'Material', dimensions: 'Dimensions', rating: 'Rating', stock: 'In stock', reviews: 'reviews', add: 'Add to cart', all: 'All products' },
  ru: { material: 'Материал', dimensions: 'Размеры', rating: 'Рейтинг', stock: 'В наличии', reviews: 'отзывов', add: 'В корзину', all: 'Все товары' },
  ja: { material: '素材', dimensions: 'サイズ', rating: '評価', stock: '在庫', reviews: 'レビュー', add: 'カートに追加', all: 'すべての商品' },
}
const t = computed(() => LABELS[locale.value as keyof typeof LABELS] ?? LABELS.en)

const BADGES = {
  en: { new: 'New', bestseller: 'Bestseller', sale: 'Sale' },
  ru: { new: 'Новинка', bestseller: 'Хит', sale: 'Скидка' },
  ja: { new: '新作', bestseller: '人気', sale: 'セール' },
}
const badgeLabel = computed(() => {
  const map = BADGES[locale.value as keyof typeof BADGES] ?? BADGES.en
  return map[props.badge as keyof typeof map] ?? props.badge
})

const money = (amount: number) =>
  new Intl.NumberFormat(locale.value || 'en', {
    style: 'currency',
    currency: props.currency || 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
</script>

<style scoped>
.product__inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: start;
}
.product__gallery {
  position: sticky;
  top: 88px;
}
.product__hero {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: var(--radius);
  background: var(--surface);
}
.product__thumbs {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.product__thumb {
  width: 72px;
  height: 72px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  overflow: hidden;
  cursor: pointer;
}
.product__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product__thumb.is-active {
  border-color: var(--ink);
}
.product__eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
}
.product__badge {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.product__title {
  margin-top: 12px;
  font-size: clamp(30px, 4vw, 44px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.product__tagline {
  margin-top: 8px;
  font-size: 19px;
  color: var(--muted);
}
.product__price {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 24px;
}
.product__amount {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.product__compare {
  font-size: 19px;
  color: var(--muted);
  text-decoration: line-through;
}
.product__desc {
  margin-top: 20px;
  font-size: 16px;
  color: var(--ink-2);
  line-height: 1.7;
}
.product__specs {
  margin: 28px 0 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 32px;
  border-top: 1px solid var(--border);
  padding-top: 24px;
}
.product__specs div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.product__specs dt {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.product__specs dd {
  margin: 0;
  font-size: 15px;
}
.product__colors {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
.product__swatch {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.product__actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
}

@media (max-width: 860px) {
  .product__inner {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .product__gallery {
    position: static;
  }
}
</style>
