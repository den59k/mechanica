# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Mechanica** is a platform for building Vue 3 websites with a visual block editor. Authors write Vue SFC "blocks", an in-page editor arranges them into pages, and pages render server-side (static export, or a future backend). This is the **v2 rewrite** — built ground-up on **Vite 8 / Vue 3.5 / Vitest 4 / Bun**, English throughout, test-covered.

Everything runs on **Bun**. Use `bun`/`bunx`, not `npm`/`node`. The dev server is started with `bunx --bun vite` because the workspace packages ship TS source with extensionless relative imports that raw Node ESM can't resolve — only Bun's resolver handles them.

Current focus is **local development** (the plugin, dev server, and editor). The hosted/SAAS backend is deferred; `mechanica push` still produces a runnable SSR bundle but the deploy/render contract is co-designed later.

## Monorepo layout

Bun workspaces under `packages/*`:

- **`mechanica`** — the published package. Contains the block **compiler** (`src/compiler/`), the **runtime** (`src/core/`), the **Vite plugin** (`src/vite/`), the in-browser **editor** (`src/editor/`), the **CLI** (`src/cli/`), and the standalone **svg-glob** Vite plugin (`src/svg-plugin.ts`).
- **`shared`** (`@mechanica/shared`) — DOM-free types, the field-type registry, schema/default helpers, the page-generation (SSG) core (`generate-page.ts`, including the `{{ }}` HTML templating engine), and the **`.page.md` page-format codec** (`page-format.ts` — `parsePage`/`serializePage`; see [CONTRACT.md](./CONTRACT.md)). The codec takes an optional `RichTextCodec` adapter so `richText` fields persist as Markdown `@field` regions on disk but stay `vuewrite` `Block[]` JSON in page state; the adapter (vuewrite-backed) is supplied by the caller — built from block schemas in `mechanica`'s `src/vite/rich-text-codec.ts` (dev server via `ssrLoadModule`, CLI export via its blocks list) — so `shared` stays vuewrite-free. Importable by the runtime and a future render service. **Keep it DOM-free.**
- **`dev-app`** — a playground site that exercises the plugin end to end. Its `.mech/` holds page/data fixtures the user actively edits in the browser; **leave those alone** unless asked.

## Commands

```bash
bun install
bun run test                    # all suites (Vitest), from the repo root
bun run typecheck               # tsc --noEmit across packages
bun run --filter mechanica test
cd packages/dev-app && bun run dev      # bunx --bun vite (the editor playground)
cd packages/dev-app && bun run export   # mechanica build + static SSG → export/
```

Per-package scripts: `test` (`vitest run`), `test:watch`, `typecheck` (`tsc --noEmit`). The CLI bin is `packages/mechanica/bin/mechanica.js <build|export|push>` (resolved as `mechanica …` inside `dev-app`).

There is no repo-wide lint. After non-trivial changes, run `bun run --filter mechanica test` **and** `bun run --filter mechanica typecheck` — both must stay green. `tsc --noEmit` does not check inside `.vue` templates/scripts, so also sanity-check components by booting the dev server (SCSS + `?svg-glob` only resolve through Vite, not tsc).

## How blocks compile (the core trick)

A block is a Vue SFC whose `<script setup>` calls the global **`defineBlock`** macro (no import). The Vite plugin runs `enforce: 'pre'` and rewrites it at the **source level** (`src/compiler/compile-block.ts`): `defineBlock({...})` → `defineProps([...]) + defineOptions({ blockId, blockSchema })`, then lets `@vitejs/plugin-vue` compile normally. This deliberately avoids v1's string-surgery on plugin-vue's internal `?vue&type=script` request URLs — the thing that pinned v1 to Vite 5. `defineBlock` is the **only** macro; `defineData` / `defineMechanicaApp` / `defineFieldType` are ordinary imported functions. Field types come from `compact-json-schema` with format aliases (`image`, `file`, `color`, `smartLink`, `multiselect`, `richText`) registered in `@mechanica/shared`.

Blocks are gathered into the `virtual:mechanica/blocks` module (`src/vite/collect-blocks.ts`).

## Runtime, modes, and entries

State shape: `State { content: ContentBlock[], data, query, page }` (in `@mechanica/shared`). `createMechanica` provides a `MechanicaContext` (content / data / blocks / router / query / page) via `inject`. The runtime is **mode-aware via context** (`'client' | 'server' | 'dev'`) — there is **no `import.meta.env` branching** (a deliberate departure from v1).

The user exports `defineMechanicaApp({ root })`; the plugin generates entries (`src/vite/entries.ts`):
- `virtual:mechanica/client` → `createMechanicaApp(def, { mode, state, blocks }).mount('#app')`
- the SSR entry exports `render(state)` / `blocksList` / `dataEntries` (used by `mechanica export` and the future backend).

`mechanica build` runs two Vite builds; the SSR build writes the generated entry to a **real temp file** because rolldown (Vite 8's bundler) can't use a `\0`-virtual module as a build entry.

## Dev server & the `.mech/` store

The plugin's `configureServer` mounts the `/@mechanica` middleware (`src/vite/dev/`) over the project's `.mech/` directory:
- `pages-store.ts` — page CRUD (`createPage`, `savePage`, `renamePage`, `duplicatePage`, `deletePage`, `listPages`, folders). Pages live at `.mech/pages/**.page.md` — a human-readable, Markdown-centric format authored primarily by Claude (`@mechanica/shared`'s `parsePage`/`serializePage`; spec in [CONTRACT.md](./CONTRACT.md)). The editor still talks JSON over the wire; only the on-disk codec is `.page.md`. Site/folder shared data (`data.json`, `folders.json`) stay JSON.
- `data-store.ts` — scoped shared data (see **Data scoping** below).
- `assets-store.ts` (uploads → `.mech/assets`), `query-dev.ts`, `middleware.ts`.

`transformIndexHtml` injects `window.state` + the client entry + `mechanica/editor` in dev (client entry only in build), and runs the `{{ }}` templating engine over `index.html` so dev matches the build (see **Page `<head>`**).

## The editor (`src/editor/`)

An in-page overlay app. `createMechanica` exposes the live runtime through a versioned **bridge** (`lib/bridge.ts`); the editor pushes edits for live preview and debounce-saves to `/@mechanica/save`. The store **clones** incoming `window.state` so it never shares mutable references with the runtime (sharing caused a typing-flicker bug — keep it cloned). Folder layout:

- **`lib/`** — non-Vue logic: `store.ts` (reactive editor store), `content-tree.ts` (tree ops + slot nesting), `drag-controller.ts` (pointer DnD), `history.ts` (undo/redo), `shortcuts.ts`, `block-meta.ts`, `use-block-frames.ts`, `page-list.ts`, `bridge.ts`, `types.ts`. Pure helpers here are unit-tested.
- **`components/`** — panels: `BlockPalette`, `HierarchyTree`, `BlockSettings`, `DataSettings`, `BlockFrame`, `PageBar`, and the **`VIcon`** component.
- **`ui/`** — the dialog system: `dialog.ts` (`createDialogStore` / `useDialog`, a stack), `VDialogHost.vue` (teleports to body, backdrop + capture-phase Escape), `VDialog.vue` (modal shell: `standard` / `wide`).
- **`dialogs/`** — dialog contents: `PagesDialog` (page browser), `DataDialog` (page data), `RichTextDialog` (rich text in a window).
- **`props-panel/`** — recursive schema form: `SchemaForm` / `SchemaField` / `ArrayField`.
- **`fields/`** — the field-editor registry (`defineFieldType` / `registerFields`) and editors (string, text, number, boolean, color, image, smartLink, multiselect, richText). The `richText` editor is `fields/richtext/RichTextEditor.vue`: a `vuewrite`-based UI (toolbar — block type + B/I/U — plus Markdown shortcuts) with a **WYSIWYG ⇄ Markdown switch** (`vuewrite/markdown`), used by both the inline field and the roomy `RichTextDialog`; `fields/richtext/config.ts` holds the shared renderer/decorator (the dev-app `RichText` viewer block mirrors it).
- **`styles/`**, **`icons/`** — see below.
- `EditorApp.vue` (shell) and `editor.ts` (dev entry) stay at the root.

**Page management:** `PageBar` (sidebar) shows the current page and opens `PagesDialog` — a searchable, folder-grouped browser that scales to hundreds of pages, with **per-row** Rename (inline) / Duplicate / Delete. There is no `<select>` dropdown and no ambient "current page" actions.

`vuesix` and `vuewrite` are the **user's own** libraries. `vuesix` is composables/utilities only (no UI components); `vuewrite` provides the `TextEditor` for rich text.

## Styling (Sass design system)

Light theme only, modern, with **black pill primary buttons** — based on the legacy look, modernized. **Use Sass.** Design tokens are CSS custom properties (`--mech-*`) in `styles/_variables.scss`. Shared primitives + editor chrome live in `styles/editor.scss` (`.mech-button` neutral, `.mech-button.is-primary` black, inputs, tabs, frames, toolbar, drag indicators). **Component-specific styles go in the component** as `<style lang="scss" scoped>` (PageBar, PagesDialog, HierarchyTree, BlockPalette, DataSettings, the dialogs, …). Consume tokens via `var(--mech-*)` — no per-file `@use` needed. Don't reintroduce a dark theme without being asked.

## Icons (VIcon + svg-glob)

Icons are individual `*.svg` files under `src/editor/icons/`, bundled as raw strings by the **`?svg-glob`** Vite plugin (`src/svg-plugin.ts`), which normalizes hard-coded colors to `currentColor` and strips `xmlns`. `VIcon.vue` imports `../icons?svg-glob` and renders `<VIcon name="filename" />`. **To add an icon:** drop a `*.svg` in `icons/` (e.g. a Figma export) and reference it by filename; size it via CSS (`.vicon` defaults to `1em`). The plugin is registered in `dev-app/vite.config.ts` and **both** projects of `packages/mechanica/vitest.config.ts` (DOM tests render real icons), and re-exported as `svgGlob` from `mechanica/plugin`. There is a `*?svg-glob` type shim in `src/vue-shim.d.ts`.

## Page `<head>` metadata (defineData + templating, not a panel)

Per-page `<head>` (title, description, Open Graph, any tag) is **ordinary data**, not a bespoke editor concept. Define a **page-scoped `defineData`** entry (e.g. `head` with `title`/`description`) and template it into `index.html` with `{{ head.title }}` placeholders. The engine is `passDataToHTML` in `@mechanica/shared` (HTML-escapes resolved values); it runs at **build** (`generatePage`) and in **dev** (`transformIndexHtml`), so the two match. `{{ page.path }}` etc. also work (e.g. canonical URLs). Small landing pages can just hardcode their `<head>`. Edit the values in the editor's **Page data** window. (`updatePageMeta` was removed; `renamePage` only changes a page's editor label.)

## Data scoping

`defineData` entries carry a `scope`: `'site' | 'folder' | 'page'`. On save the dev server **splits** the data by scope (`data-store.ts` `splitDataByScope`): site → `.mech/data.json`, folder → `.mech/folders.json` (keyed by folder), page → the page file. Dev inject and static export **merge** site + the page's folder data back over the page's own data, so a value is authored once and shared correctly. The editor's "Edit page data" window edits all scopes (sorted site → folder → page).

## Conventions

TypeScript strict, ESM, named exports for the public API. **kebab-case** for TS modules, **PascalCase** for `.vue`. Tests are under each package's `test/` (mirroring `src/`), `*.test.ts` (Node) / `*.dom.test.ts` (jsdom), importing source via the `@/` alias; the mechanica Vitest config has two projects and a `@mechanica/shared` → source alias (mirrored by tsconfig `paths`). Prefer pure, unit-testable helpers in `lib/` over logic embedded in components. English everywhere. `.vue` / `.css` / `.scss` / `*?svg-glob` imports are covered by `src/vue-shim.d.ts`; virtual modules by `src/virtual-modules.d.ts`.

When you change something, keep tests + typecheck green and add coverage. The legacy v1 lives in the sibling **`mechanics`** repo (reference only — don't edit it).
