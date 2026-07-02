---
name: HMR for blocks
data:
  head:
    title: HMR for blocks — Blog
    description: Add, remove or reshape a block and the editor keeps up.
  postMeta:
    date: "2026-04-08"
    description: Schema edits re-collect the block set and reload; template edits stay instant HMR.
---

::: hero #intro
title: HMR for blocks
@subtitle
Template edits hot-swap in place; schema edits honestly reload the editor.
:::

::: rich-text #body
@content
The plugin tracks each block's compiled schema. When only the template or styles change, normal Vite HMR applies. When the schema changes, the palette and settings forms would go stale — so the blocks module re-collects and the page reloads.
:::
