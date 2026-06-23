# mechanica

Build Vue 3 websites with a visual block editor. Authors write Vue SFC **blocks**, a visual editor arranges them into pages, and the result renders server-side and ships statically or via a backend.

Built for **Vite 8 / Vue 3.5 / Bun**.

## Install

```bash
bun add mechanica
```

## Quick start

**`vite.config.ts`**
```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mechanica } from 'mechanica/plugin'

export default defineConfig({
  plugins: [mechanica(), vue()],
})
```

**`index.html`** — just a mount point; the plugin injects the entry and editor:
```html
<body><div id="app"></div></body>
```

**`src/main.ts`** — export an app definition (no `createApp`/`mount` yourself):
```ts
import { defineMechanicaApp } from 'mechanica'
import App from './App.vue'

export default defineMechanicaApp({ root: App })
```

**`src/App.vue`** — render the page content somewhere:
```vue
<template>
  <Content />
</template>
<script setup lang="ts">
import { Content } from 'mechanica'
</script>
```

**`src/blocks/Hero.vue`** — a block. `defineBlock` is a global macro (no import):
```vue
<template>
  <section>
    <h1>{{ props.title }}</h1>
    <p>{{ props.subtitle }}</p>
  </section>
</template>
<script setup lang="ts">
const props = defineBlock({
  name: 'Hero',
  category: 'Content',
  props: {
    title: { type: 'string', default: 'Hello' },
    subtitle: 'text',
  },
})
</script>
```

Run `bunx --bun vite` and open the page — the editor overlay lets you add Hero blocks and edit their props live.

## Authoring API

### `defineBlock(descriptor)` — the one macro
No import; used inside a block's `<script setup>`. Fields use [compact-json-schema](https://www.npmjs.com/package/compact-json-schema). Built-in field types: `string`, `text`, `number`, `boolean`, `color`, `image`, `file`, `smartLink`, `multiselect`, `richText`, plus `array`/`object`. Object-form fields take editor metadata (`label`, `description`, `default`, `placeholder`).

```ts
defineBlock({
  name, category, icon, description, order, hidden,
  props: { /* schema */ },
  slots: ['default'],   // auto-detected from <slot> if omitted
})
```

### `defineData({ id, scope, props })` — shared data
An **imported function** (not a macro), used in a standalone module; returns a hook:
```ts
// data/header.ts
import { defineData } from 'mechanica'
export const useHeader = defineData({ id: 'header', scope: 'site', props: { logo: 'image' } })
// in a component: const header = useHeader()
```

### Components & composables
`<Content>`, `<Link :to="..." />` (string path or `smartLink` object), `useRouter`, `useRoute`, `usePages`, `useFetch`, `usePageData`.

### Custom field types
```ts
import { defineFieldType, registerFields } from 'mechanica/editor'
registerFields([
  defineFieldType({ name: 'video', schema: { type: 'object', properties: { src: 'string' } }, editor: VideoField }),
])
```

## CLI

```bash
mechanica build     # client + SSR bundles → dist/
mechanica export    # statically render every .mech page → export/
mechanica push --key <apiKey> --host <url>   # upload dist/ to a backend
```

Local page content lives in `.mech/pages/**.json` and is edited via the visual editor.
