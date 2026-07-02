---
name: Queries & pagination
data:
  head:
    title: Queries & pagination — Blog
    description: usePages, usePagination and build-time query baking.
  postMeta:
    date: "2026-06-30"
    description: The blog index you used to reach this post is a paginated query, split into real pages at export.
---

::: hero #intro
title: Queries & pagination
@subtitle
This very blog is the demo — the index lists posts through usePagination.
:::

::: rich-text #body
@content
One query engine serves three callers: the dev server resolves live, the static export resolves at build time and bakes results into each page's state, and extra chunks become real pages — `/blog/2` is a file on disk, in the sitemap, with its own slice.
:::
