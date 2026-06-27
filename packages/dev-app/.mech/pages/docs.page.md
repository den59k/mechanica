---
name: Docs
meta: { title: Docs — Mechanica }
data:
  head:
    title: Docs — Mechanica
    description: Getting started with Mechanica, the visual block editor for Vue.
---

::: docs-article #doc
eyebrow: Documentation
title: Getting started
sections:
  - heading: Install
    body: Clone the repo and run bun install. Start the editor playground with bun run dev, and export a static site with bun run export.
  - heading: Author a block
    body: A block is a Vue SFC whose <script setup> calls the defineBlock macro. Its props become the editable fields shown in the editor's settings panel.
  - heading: Link between pages
    body: "Use the smartLink field to point at another page: search by name or path and the link's title is filled in for you. This page links back home below."
back:
  url: /
  title: ← Back to home
  external: false
  openNewTab: false
@lead
Mechanica is a visual block editor for Vue. Author blocks as real Vue components, arrange them on the page, and export a static site.
:::
