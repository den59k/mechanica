---
name: Hello, Mechanica
data:
  head:
    title: Hello, Mechanica — Blog
    description: Why we are building a block editor on plain Vue components.
  postMeta:
    date: "2026-01-12"
    description: Why we are building a website builder where every block is a plain Vue component you keep in git.
---

::: hero #intro
title: Hello, Mechanica
@subtitle
The first post on the dev-app blog — what this project is and why it exists.
:::

::: rich-text #body
@content
Most site builders make you choose: a visual editor **or** real components. Mechanica refuses the choice — authors write ordinary Vue SFCs, editors arrange them on the live page, and everything lands in git as readable files.

## What's here so far

The compiler, the in-page editor, static export, and this blog — which is itself a `blog-list` block running a paginated query.
:::
