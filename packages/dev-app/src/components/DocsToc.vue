<template>
  <aside v-show="items.length" class="docstoc" aria-label="On this page">
    <p class="docstoc__label">On this page</p>
    <ul class="docstoc__list">
      <li v-for="item in items" :key="item.id" :class="`docstoc__item--h${item.level}`">
        <a
          class="docstoc__link"
          :class="{ 'is-active': active === item.id }"
          :href="`#${item.id}`"
          @click="active = item.id"
          >{{ item.text }}</a
        >
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'mechanica'

interface TocItem {
  id: string
  text: string
  level: number
}

const items = ref<TocItem[]>([])
const active = ref('')
const route = useRoute()
let observer: IntersectionObserver | null = null

// Scan the rendered docs content for anchored headings and wire up scroll-spy.
// Re-runs on SPA navigation (the content swaps in place).
function scan() {
  if (typeof document === 'undefined') return
  const root = document.querySelector('.docs-content')
  const headings = root ? Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]')) : []

  items.value = headings.map((heading) => ({
    id: heading.id,
    text: (heading.textContent ?? '').trim(),
    level: heading.tagName === 'H3' ? 3 : 2,
  }))
  active.value = headings[0]?.id ?? ''

  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) active.value = (entry.target as HTMLElement).id
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  )
  headings.forEach((heading) => observer!.observe(heading))
}

const rescan = () => requestAnimationFrame(scan)

onMounted(rescan)
watch(() => route.path, rescan)
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.docstoc {
  position: sticky;
  top: 88px;
}
.docstoc__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}
.docstoc__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-left: 1px solid var(--border);
}
.docstoc__link {
  display: block;
  padding: 5px 0 5px 14px;
  margin-left: -1px;
  border-left: 2px solid transparent;
  font-size: 13.5px;
  color: var(--muted);
  transition:
    color 0.12s,
    border-color 0.12s;
}
.docstoc__item--h3 .docstoc__link {
  padding-left: 26px;
}
.docstoc__link:hover {
  color: var(--ink-2);
}
.docstoc__link.is-active {
  color: var(--brand);
  border-color: var(--brand);
  font-weight: 600;
}
</style>
