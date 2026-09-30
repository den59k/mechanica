# My Mechanica site

A Vue 3 website built with [Mechanica](https://www.npmjs.com/package/mechanica) — author blocks as Vue components, arrange them in a live in-browser editor, export a static site.

Works with plain Node ≥ 20.19 (npm/pnpm/yarn) or [Bun](https://bun.sh).

## Commands

```bash
npm install
npm run dev        # dev server + in-page editor
npm run export     # static site → export/
npm run typecheck  # tsc --noEmit
```

With the dev server running you can also verify work visually:

```bash
npx mechanica shot <blockId>     # screenshot one block (uses its previewData)
npx mechanica shot /             # screenshot a page
npx mechanica thumbs --blocks    # regenerate palette thumbnails
```

These drive a locally installed Chrome or Edge and need Node 22+ (or Bun).

## Project layout

- `src/blocks/` — the site's blocks. A block is a Vue SFC whose `<script setup>` calls the global `defineBlock` macro (no import needed): props schema, `previewData` for the palette preview, optional `chunk` for code splitting. New files appear in the editor palette immediately.
- `src/App.vue` — the app shell. Site-wide chrome (header/footer) goes here, around `<Content/>`.
- `src/data/` — shared data entries (`defineData`); each value is set per page, per folder or site-wide in the editor's Page data window. `head.ts` feeds the `{{ head.* }}` placeholders in `index.html`.
- `src/composer.ts` — the Block Composer manifest: the components and CSS classes designers can use when building blocks visually.
- `src/styles/site.css` — global design tokens + reset.
- `.mech/pages/*.page.md` — the pages: a human-readable Markdown format, equally editable by hand and by the visual editor.
- `.mech/assets/` — uploaded files (copied to `/media/` on export).
- `CLAUDE.md` — guidance for AI coding assistants (e.g. Claude Code) on authoring blocks and pages in this project.

## Editing pages

Run `npm run dev`, open the printed URL, and the editor overlays the live page: a block palette, hierarchy tree, per-block prop forms, undo/redo, a page browser, and a Ctrl+K page switcher. Edits save back into `.mech/pages/*.page.md` — hand edits to those files while the editor is open sync in live.

`npm run export` writes a static site to `export/`, built to be served from the root of a domain. See the [mechanica README](https://www.npmjs.com/package/mechanica) for everything else: layouts, multi-language pages, images, SEO, the Block Composer.
