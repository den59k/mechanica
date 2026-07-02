# Mechanica

A platform for building Vue 3 websites with a visual block editor. Site authors write Vue SFC "blocks", a visual editor arranges them into pages, and the result is rendered server-side.

This is the v2 rewrite — built on **Vite 8 / Bun / Vue 3.5**, English throughout, test-covered from the start.

## Docs

- [CONTRACT.md](./CONTRACT.md) — the `.page.md` on-disk page format (frontmatter, block fences, `@field` prose regions).
- [PREVIEW.md](./PREVIEW.md) — block previews and `mechanica shot`: `previewData` (+ `$slots`), the standalone preview route, and headless block/page screenshots for visual feedback loops.

## Layout

Bun workspaces under `packages/*`:

- **`mechanica`** — the published plugin: the `defineBlock` runtime, the Vite plugin (block compiler + dev server + build), the in-browser editor, and the `mechanica` CLI (`build` / `export` / `push` / `shot` / `thumbs`).
- **`shared`** — `@mechanica/shared`: DOM-free types, schema helpers, the `.page.md` codec, and the page-generation core.
- **`dev-app`** — playground site used to exercise the plugin end to end.

## Commands

```bash
bun install
bun run test          # run all package test suites (Vitest)
bun run typecheck     # tsc --noEmit across packages

cd packages/dev-app
bun run dev           # the editor playground
bun run export        # static SSG → export/
bunx mechanica shot hero    # screenshot a block (see PREVIEW.md)
bunx mechanica thumbs       # page thumbnails for the editor's page browser
```
