# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, …) working in this **Mechanica** site.

## What this is

A Vue 3 website built with [Mechanica](https://www.npmjs.com/package/mechanica): the
content is **blocks** (plain Vue components) arranged into **pages**, rendered
server-side to a static site. There's a live in-browser editor, but pages are
also plain files you can author and edit directly — that's mostly what you'll do:
**create/edit blocks in `src/blocks/`** and **author pages in `.mech/pages/`**.

This file covers the everyday loop. For anything beyond it, read the docs that
match the installed version instead of guessing:

- `node_modules/mechanica/README.md` — the full guide: layouts, multi-language
  pages, page queries and pagination, generated pages, images, SEO, the Block
  Composer, plugin options, the CLI.
- `node_modules/mechanica/dist/types/` — the API with doc comments
  (`vite/plugin.d.ts` for plugin options, `core/` for components and composables);
  `node_modules/mechanica-shared/dist/types/types.d.ts` for every `defineBlock` option.

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

`shot` and `thumbs` drive a locally installed Chrome or Edge and need Node 22+ (or Bun).

If the site is hosted on the Mechanica platform (the repository has a git remote named `mechanica`), `npx mechanica push` publishes the committed work: it pulls what was edited online, pushes the checked-out branch, builds and uploads the bundle when the code changed, and waits for the deploy. It refuses a dirty tree, so commit first. `npx mechanica assets pull` downloads the uploads made in the online editor (the dev server also fetches them one by one on demand). A project that is not linked yet is connected with `npx mechanica login` and `npx mechanica link <slug> --create`. `login` prints a link: show it to the person you work for exactly as printed, wait until they say they approved it in the browser, then go on — the next `mechanica` command finishes the sign-in. Never ask for a password or a token.

## Layout

- `src/blocks/` — the site's blocks (Vue SFCs). A new file here appears in the editor palette immediately.
- `src/components/` — plain Vue components (not blocks): building blocks used *inside* blocks, or exposed to the composer.
- `src/composer.ts` — the Block Composer manifest (`defineComposer`): components, CSS classes, and breakpoints offered in the visual composer.
- `src/data/` — shared data entries (`defineData`); each value is set per page, per folder or site-wide in the editor's Page data window. `head.ts` feeds the `{{ head.* }}` placeholders in `index.html`.
- `src/App.vue` / `src/main.ts` — the app shell (site-wide header/footer go in `App.vue`, around `<Content/>`) and the entry (`defineMechanicaApp`).
- `src/styles/site.css` — global design tokens (`--brand`, `--ink`, …) + a small reset. Block-specific styles live in each block's own `<style>`.
- `.mech/pages/**.page.md` — the pages (see below).
- `.mech/assets/` — uploaded files, served at `/media/<file>` in dev and on the exported site.
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
    subtitle: 'text',            // format alias; also: richText, image, smartLink, color, multiselect
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
block — `::: <blockId> #<nodeId>` (the `#<nodeId>` is optional), scalar props as
`key: value`, and long text as `@field` regions, closed by `:::`. A region fills a
`text` prop with its text as written, and a `richText` prop with its Markdown
turned into rich text:

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
This paragraph fills the subtitle, a plain text field.
:::
```

`<blockId>` is the block's kebab-case name (`Hero.vue` → `hero`, `RichText.vue` →
`rich-text`). Defaulted props may be omitted — defaults fill in automatically, so
a hand-authored page renders identically to an editor-authored one. **See
[.mech/pages/index.page.md](.mech/pages/index.page.md) for the worked example.**

The rules that trip up hand-authoring:

- **Order inside a block: props → `@field` regions → child blocks.** Once a
  region has started, a `key: value` line is part of its text, not a prop.
- **Nothing is indented.** Every `:::` and `@field` starts at the beginning of
  its line; a block nests inside whichever fence is still open. Put a child in a
  named slot with `slot=<name>` on its open line — a container's children go
  either all to the default slot or all to named ones:

  ```markdown
  ::: columns
  gap: lg
  ::: card slot=left
  title: Fast
  :::
  ::: card slot=right
  title: Readable
  :::
  ::: /columns
  ```

  `::: /columns` is an optional checked close: use it on containers, so a
  missing `:::` fails at that line instead of silently re-nesting the rest.
- **Props are YAML** — quote a value that starts with `#` or contains `: `
  (`ctaHref: "#next-steps"`). Regions need no quoting; only a line that starts
  with `:::`, or consists of just `@name`, takes a leading backslash (`\:::`),
  and not even that inside a code fence.

An `image` prop points at a file in `.mech/assets/`:
`photo: { src: /media/team.jpg, alt: "Our team" }`. After adding
images by hand, run `npx mechanica images` (needs `npm install -D sharp`) to
record their dimensions and blur-up previews — never inline a data URI.

**After authoring or editing a page, run `npx mechanica shot /its/path`** and
look at the PNG.

## `<head>` metadata

Per-page `<head>` is ordinary data, not a special panel: the `head` `defineData`
entry (`src/data/head.ts`) is templated into `index.html` via `{{ head.title }}`
etc., at both build and dev. Edit the values in the editor's **Page data** window,
or in a page's frontmatter `data.head`. Small pages can just hardcode `<head>`.

A `defineData` entry only exists once its module is imported — normally by the
block or component that uses it. `App.vue` imports `./data/head` because only
`index.html` reads it; keep that import, and import any other data module that
nothing else uses, or its values are silently dropped from the page.
