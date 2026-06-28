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
@content
A block is a Vue single-file component whose `<script setup>` calls the global
`defineBlock` macro. Its declared props become the editable fields shown in the
editor's settings panel.

```vue
<template>
  <h1>{{ props.title }}</h1>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Headline',
  props: { title: { type: 'string', default: 'Hello' } },
})
</script>
```
:::

::: doc-section #slots-and-nesting
title: Slots & nesting
@content
A block with a `<slot/>` becomes a *container* — other blocks nest inside it.
This very page is a **Docs layout** block whose slot holds the section blocks
you're reading. Named slots (`<slot name="start"/>`) let one block expose
several drop zones.

<callout tone="info">Drag a block onto a slot in the editor's layers tree to nest it.</callout>
:::

::: doc-section #fields
title: Fields
@content
Field types come from `compact-json-schema` with friendly format aliases —
`image`, `color`, `smartLink`, `multiselect`, `richText`, and more. Pick the
right field and the editor renders the matching control automatically.
:::

::: /docs-layout
