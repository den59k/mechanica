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
::: prose #p-intro
@body
**Mechanica** is a platform for building Vue 3 websites with a visual block
editor. You write Vue SFC *blocks*, arrange them on a page in an in-browser
editor, and render the result — today as a static export, tomorrow from a server.

Everything in these docs is built from the same blocks you'd use on any page:
this three-column layout, the section headings, this paragraph, and the code
samples below.
:::
::: /doc-section
::: doc-section #how-the-pieces-fit
title: How the pieces fit
::: prose #p-fit
@body
A site is made of three things:

- **Blocks** — Vue components that declare their editable fields with `defineBlock`.
- **Pages** — ordered trees of blocks, stored as human-readable `.page.md` files.
- **Data** — shared values (site, folder, page) templated into blocks and the head.
:::
::: callout #c-tip
tone: tip
title: Authored by hand
@body
These pages are written directly in the `.page.md` format — prose lives in clean
`@body` regions, so there's no JSON escaping to fight.
:::
::: /doc-section
::: doc-section #get-started
title: Get started
::: prose #p-start
@body
Clone the repo, install with Bun, and start the editor playground:
:::
::: code-block #cb-start
language: bash
@code
bun install
cd packages/dev-app
bun run dev
:::
::: /doc-section
::: /docs-layout
