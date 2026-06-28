---
name: Introduction
meta: { title: Introduction — Mechanica Docs }
data:
  head:
    title: Introduction — Mechanica Docs
    description: What Mechanica is and how its pieces fit together.
order: 0
---

::: docs-layout #docs
::: doc-section #what-is-mechanica
title: What is Mechanica?
@content
**Mechanica** is a platform for building Vue 3 websites with a visual block
editor. You write Vue SFC *blocks*, arrange them on a page in an in-browser
editor, and render the result — today as a static export, tomorrow from a server.

Everything in these docs is built from the same blocks you'd use on any page:
this three-column layout, the section headings, this paragraph, and the code
samples below.
:::

::: doc-section #how-the-pieces-fit
title: How the pieces fit
@content
A site is made of three things:

- **Blocks** — Vue components that declare their editable fields with `defineBlock`.
- **Pages** — ordered trees of blocks, stored as human-readable `.page.md` files.
- **Data** — shared values (site, folder, page) templated into blocks and the head.

<callout tone="tip">**Authored by hand** — these pages are written directly in the `.page.md` format, so prose lives in clean `@content` regions with no JSON escaping to fight.</callout>
:::

::: doc-section #get-started
title: Get started
@content
Clone the repo, install with Bun, and start the editor playground:

```bash
bun install
cd packages/dev-app
bun run dev
```
:::

::: /docs-layout
