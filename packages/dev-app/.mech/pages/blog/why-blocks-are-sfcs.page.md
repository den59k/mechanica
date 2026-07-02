---
name: Why blocks are just SFCs
data:
  head:
    title: Why blocks are just SFCs — Blog
    description: No DSL, no lock-in — a block is a Vue component with one macro.
  postMeta:
    date: "2026-02-03"
    description: A block is a Vue component that calls defineBlock. No DSL, no runtime registry, no lock-in.
---

::: hero #intro
title: Why blocks are just SFCs
@subtitle
One macro, zero ceremony — the compiler does the rest at the source level.
:::

::: rich-text #body
@content
`defineBlock` is the only macro in the system. It compiles away into `defineProps` plus schema metadata, which means a block is testable, typeable, and portable like any other component.

Your design system stays yours — Mechanica only asks blocks to describe their editable props.
:::
