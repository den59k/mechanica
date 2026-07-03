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

## Project layout

- `src/blocks/` — the site's blocks. A block is a Vue SFC whose `<script setup>` calls the global `defineBlock` macro (no import needed): props schema, `previewData` for the palette preview, optional `chunk` for code splitting. New files appear in the editor palette immediately.
- `src/App.vue` — the app shell. Site-wide chrome (header/footer) goes here, around `<Content/>`.
- `src/data/` — shared data entries (`defineData`), scoped `site` / `folder` / `page`. `head.ts` feeds the `{{ head.* }}` placeholders in `index.html`.
- `src/styles/site.scss` — global design tokens + reset.
- `.mech/pages/*.page.md` — the pages: a human-readable Markdown format, equally editable by hand and by the visual editor.
- `.mech/assets/` — uploaded files (copied to `/media/` on export).

## Editing pages

Run `npm run dev`, open the printed URL, and the editor overlays the live page: a block palette, hierarchy tree, per-block prop forms, undo/redo, and a page browser (Ctrl+K). Edits save back into `.mech/pages/*.page.md` — hand edits to those files while the editor is open sync in live.
