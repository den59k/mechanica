---
name: Blocks
meta: { title: Blocks — Mechanica Docs }
data:
  head:
    title: Blocks — Mechanica Docs
    description: How blocks are authored, nested, and configured.
order: 1
---

::: docs-layout #docs
::: doc-section #anatomy-of-a-block
title: Anatomy of a block
::: prose #p1
@body
A block is a Vue single-file component whose `<script setup>` calls the global
`defineBlock` macro. Its declared props become the editable fields shown in the
editor's settings panel.
:::
::: code-block #cb1
language: vue
@code
<template>
  <h1>{{ props.title }}</h1>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Headline',
  props: { title: { type: 'string', default: 'Hello' } },
})
</script>
:::
::: /doc-section
::: doc-section #slots-and-nesting
title: Slots & nesting
::: prose #p2
@body
A block with a `<slot/>` becomes a *container* — other blocks nest inside it.
This very page is a **Docs layout** block whose slot holds the section blocks
you're reading. Named slots (`<slot name="start"/>`) let one block expose
several drop zones.
:::
::: callout #c2
tone: info
@body
Drag a block onto a slot in the editor's layers tree to nest it.
:::
::: /doc-section
::: doc-section #fields
title: Fields
::: prose #p3
@body
Field types come from `compact-json-schema` with friendly format aliases —
`image`, `color`, `smartLink`, `multiselect`, `richText`, and more. Pick the
right field and the editor renders the matching control automatically.
:::
::: /doc-section
::: /docs-layout
