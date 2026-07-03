---
name: Introduction
meta: { title: Introduction — Mechanica Docs }
data:
  head:
    title: Introduction — Mechanica Docs
    description: What Mechanica is and how its pieces fit together.
  postMeta: { date: "", description: "" }
order: 0
---

::: docs-layout #docs
folder: docs
::: doc-section #how-the-pieces-fit
title: How the pieces fit
@content
`A site is made of three things:`

- **Blocks** — Vue components that **declare** their editable fields with `defineBlock`.
- **Pages** — ordered trees of blocks, stored as human-readable `.page.md` files.
- **Data** — shared values (site, folder, page) templated into blocks and the head.

<callout tone="tip">**Authored by hand** — these pages are written directly in the `.page.md` format, so prose lives in clean `@content` regions with no JSON escaping to fight</callout>

wewqeqwe

qweeq

qweeqw

|  | qweeqw | qweewq |  |  |
| --- | --- | --- | --- | --- |
|  | qwe | qweewq |  |  |
|  |  |  |  |  |


:::

::: doc-section #get-started
title: Get started
@content
Clone the repo, install with Bun, and start the editor playground

```bun
bun install
cd packages/dev-app
bun run dev
```
:::

::: /docs-layout
