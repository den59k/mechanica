---
name: Every block its own chunk
data:
  head:
    title: Every block its own chunk — Blog
    description: Per-page code splitting with zero changes to block authoring.
  postMeta:
    date: "2026-06-10"
    description: The client build splits every block into its own chunk; each exported page preloads exactly what it uses.
---

::: hero #intro
title: Every block its own chunk
@subtitle
Pages ship only the code for the blocks they actually place.
:::

::: rich-text #body
@content
The blocks module becomes a map of dynamic imports in the client build. The entry awaits only the current page's blocks before hydrating, exported pages carry per-page preload links, and SPA navigation fetches missing chunks before the content swap.
:::
