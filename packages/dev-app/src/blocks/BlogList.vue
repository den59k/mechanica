<template>
  <section class="bloglist mc-section">
    <div class="mc-container">
      <div class="bloglist__head">
        <span v-if="props.eyebrow" class="mc-eyebrow">{{ props.eyebrow }}</span>
        <h1 class="bloglist__title">{{ props.title }}</h1>
      </div>

      <p v-if="!blog.items.length" class="bloglist__empty">No posts yet.</p>

      <div class="bloglist__grid">
        <article v-for="post in blog.items" :key="post.path" class="post">
          <time v-if="post.postMeta?.date" class="post__date">{{ formatDate(post.postMeta.date) }}</time>
          <h2 class="post__title">
            <Link :to="post.path">{{ post.name }}</Link>
          </h2>
          <p v-if="post.postMeta?.description" class="post__desc">{{ post.postMeta.description }}</p>
          <Link :to="post.path" class="post__more">Read post →</Link>
        </article>
      </div>

      <nav v-if="blog.pageCount > 1" class="bloglist__pager" aria-label="Blog pages">
        <Link v-if="blog.prevPath" :to="blog.prevPath" class="pager__link">← Newer</Link>
        <span v-else class="pager__link is-disabled">← Newer</span>
        <Link
          v-for="n in blog.pageCount"
          :key="n"
          :to="blog.pathFor(n)"
          class="pager__num"
          :class="{ 'is-current': n === blog.page }"
        >
          {{ n }}
        </Link>
        <Link v-if="blog.nextPath" :to="blog.nextPath" class="pager__link">Older →</Link>
        <span v-else class="pager__link is-disabled">Older →</span>
      </nav>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Link, usePagination } from 'mechanica'
import { usePostMeta } from '../data/post-meta'

const props = defineBlock({
  name: 'Blog list',
  category: 'Blog',
  description: 'Paginated list of the posts in this folder, newest first',
  folders: ['blog'],
  props: {
    title: { type: 'string', default: 'Blog' },
    eyebrow: { type: 'string', default: 'Notes & releases' },
    pageSize: { type: 'number', default: 4 },
  },
})

const blog = usePagination({
  folderName: 'blog',
  data: [usePostMeta],
  sort: { by: 'postMeta.date', dir: 'desc' },
  pageSize: props.pageSize || 4,
})

const formatDate = (iso: string) => {
  const date = new Date(iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.bloglist__head {
  max-width: 640px;
  margin-bottom: 40px;
}
.bloglist__title {
  margin-top: 10px;
  font-size: clamp(30px, 4.4vw, 44px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.bloglist__empty {
  color: var(--muted);
}
.bloglist__grid {
  display: grid;
  gap: 28px;
}
.post {
  padding: 24px 0;
  border-bottom: 1px solid var(--border);
}
.post__date {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.post__title {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.post__title a {
  color: var(--ink);
  text-decoration: none;
}
.post__title a:hover {
  text-decoration: underline;
}
.post__desc {
  margin-top: 8px;
  max-width: 640px;
  color: var(--muted);
  line-height: 1.6;
}
.post__more {
  display: inline-block;
  margin-top: 10px;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--brand);
  text-decoration: none;
}
.bloglist__pager {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 40px;
}
.pager__link,
.pager__num {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  text-decoration: none;
  background: #fff;
}
.pager__link.is-disabled {
  opacity: 0.4;
}
.pager__num.is-current {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}
.pager__link:not(.is-disabled):hover,
.pager__num:not(.is-current):hover {
  border-color: var(--ink);
}
</style>
