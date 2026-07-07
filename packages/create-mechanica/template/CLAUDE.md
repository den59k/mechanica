# CLAUDE.md

Guidance for Claude Code working in this **Mechanica** site.

## What this is

A Vue 3 website built with [Mechanica](https://www.npmjs.com/package/mechanica): the
content is **blocks** (plain Vue components) arranged into **pages**, rendered
server-side to a static site. There's a live in-browser editor, but pages are
also plain files you can author and edit directly — that's mostly what you'll do:
**create/edit blocks in `src/blocks/`** and **author pages in `.mech/pages/`**.

## Commands

```bash
npm run dev        # dev server + in-page editor — keep this running while you work
npm run export     # build the static site into export/
npm run typecheck  # tsc --noEmit
```

Verify visual work with the dev server running:

```bash
npx mechanica shot <blockId>     # screenshot one block (uses its previewData)
npx mechanica shot /some/path    # screenshot a whole page
npx mechanica shot <blockId> --width 1440,390   # check responsive
npx mechanica thumbs --blocks    # regenerate palette thumbnails
```

## Layout

- `src/blocks/` — the site's blocks (Vue SFCs). A new file here appears in the editor palette immediately.
- `src/components/` — plain Vue components (not blocks): building blocks used *inside* blocks, or exposed to the composer.
- `src/composer.ts` — the Block Composer manifest (`defineComposer`): components, CSS classes, and breakpoints offered in the visual composer.
- `src/data/` — shared data entries (`defineData`), scoped `site` / `folder` / `page`. `head.ts` feeds the `{{ head.* }}` placeholders in `index.html`.
- `src/App.vue` / `src/main.ts` — the app shell (site-wide header/footer go in `App.vue`, around `<Content/>`) and the entry (`defineMechanicaApp`).
- `src/styles/site.css` — global design tokens (`--brand`, `--ink`, …) + a small reset. Block-specific styles live in each block's own `<style>`.
- `.mech/pages/**.page.md` — the pages (see below).
- `.mech/assets/` — uploaded files (copied to `/media/` on export).
- `index.html` — the document `<head>`, with `{{ }}` templating (see below).
- `export/` — the built static site. **Generated — never hand-edit.**

## Blocks

A block is a Vue SFC whose `<script setup>` calls the global **`defineBlock`**
macro — no import needed (it's the *only* macro; `defineData` / `defineComposer` /
`defineMechanicaApp` are ordinary imported functions).

```vue
<script setup lang="ts">
const props = defineBlock({
  name: 'Hero',
  category: 'Content',
  description: 'A page-opening headline',
  props: {
    title: { type: 'string', default: 'Hello' },
    subtitle: 'text',            // format alias; also: richText, image, smartLink, color, file, multiselect
    ctaHref: { type: 'string', default: '' },
  },
  // Example values shown in the palette preview + the standalone preview route.
  // ALWAYS give meaningful previewData — it's how blocks are verifiable in shots.
  previewData: { title: 'Build sites visually', subtitle: 'From previewData.' },
})
</script>
```

Props schemas use [`compact-json-schema`](https://www.npmjs.com/package/compact-json-schema).
Render an image field with `<Image>` and a link with `<Link>` (both `import … from 'mechanica'`) so
lazy-loading and SPA routing work. Heavy, rarely-used blocks can set `chunk: '<name>'`
to code-split out of the main bundle.

**After creating or visually changing a block, run `npx mechanica shot <blockId>`
and look at the PNG** before considering it done.

## Pages (`.page.md`)

Pages live at `.mech/pages/**.page.md` — a human-readable Markdown format you can
author by hand *and* that the visual editor reads/writes. With `npm run dev`
running, hand edits sync into the editor live.

Shape: YAML frontmatter (`name`, page `data`) + one fenced block per content
block — `::: <blockId> #<nodeId>`, scalar props as `key: value`, and text /
`richText` props as `@field` Markdown regions, closed by `:::`:

```markdown
---
name: Home
data:
  head:
    title: My page
---

::: hero #welcome
title: Your site is running
@subtitle
This paragraph is a **text** field, authored as Markdown.
:::
```

`<blockId>` is the block's kebab-case name (`Hero.vue` → `hero`, `RichText.vue` →
`rich-text`). Defaulted props may be omitted — defaults fill in automatically, so
a hand-authored page renders identically to an editor-authored one. **See
[.mech/pages/index.page.md](.mech/pages/index.page.md) for the worked example.**

**After authoring or editing a page, run `npx mechanica shot /its/path`** and
look at the PNG.

## `<head>` metadata

Per-page `<head>` is ordinary data, not a special panel: the `head` `defineData`
entry (`src/data/head.ts`) is templated into `index.html` via `{{ head.title }}`
etc., at both build and dev. Edit the values in the editor's **Page data** window,
or in a page's frontmatter `data.head`. Small pages can just hardcode `<head>`.
```
