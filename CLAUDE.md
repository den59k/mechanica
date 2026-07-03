# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Mechanica** is a platform for building Vue 3 websites with a visual block editor. Authors write Vue SFC "blocks", an in-page editor arranges them into pages, and pages render server-side (static export, or a future backend). This is the **v2 rewrite** — built ground-up on **Vite 8 / Vue 3.5 / Vitest 4 / Bun**, English throughout, test-covered.

**Repo development runs on Bun** — use `bun`/`bunx`, not `npm`/`node`. **Published packages do not require Bun**: `bun run build` compiles `@mechanica/shared` and `mechanica` to `dist/` (plain JS + `.d.ts`), and package `exports` point there (`import` condition), so consumers run on stock Node ≥ 20.19 with npm/pnpm/yarn. The `bun` export condition and the CLI launcher (`bin/mechanica.js` checks `process.versions.bun`) keep Bun resolving the raw TS source — which is why the monorepo itself needs no build step: the repo's TS ships extensionless relative imports that only Bun's resolver (or a bundler) handles, never raw Node ESM. dev-app's dev server stays `bunx --bun vite` for exactly that reason.

Current focus is **local development** (the plugin, dev server, and editor). The hosted/SAAS backend is deferred; `mechanica push` still produces a runnable SSR bundle but the deploy/render contract is co-designed later.

## Monorepo layout

Bun workspaces under `packages/*`:

- **`mechanica`** — the published package. Contains the block **compiler** (`src/compiler/`), the **runtime** (`src/core/`), the **Vite plugin** (`src/vite/`), the in-browser **editor** (`src/editor/`), the **CLI** (`src/cli/`), and the standalone **svg-glob** Vite plugin (`src/svg-plugin.ts`). **Dist build** (`bun run build`): `vite.lib.config.ts` builds the browser entries (`index`/`editor`/`widgets`) **together** so shared `src/core` modules land in common chunks — one module instance at runtime; splitting them would duplicate the data registry. `?svg-glob` icons compile in (consumers don't register `svgGlob`), `virtual:mechanica/*` stays external, `dist/editor.js` imports its extracted `dist/editor.css`. `vite.node.config.ts` builds `plugin` + `cli` for raw Node. `tsconfig.build.json` emits `dist/types` (it drops the paths-to-source mapping — shared must be built first). dev-app aliases the browser entries back to workspace source in its `vite.config.ts` (+ tsconfig `paths`), so editor/runtime dev stays live with no build.
- **`shared`** (`@mechanica/shared`) — DOM-free types, the field-type registry, schema/default helpers, the page-generation (SSG) core (`generate-page.ts`, including the `{{ }}` HTML templating engine), and the **`.page.md` page-format codec** (`page-format.ts` — `parsePage`/`serializePage`; see [CONTRACT.md](./CONTRACT.md)). The codec is a separate entry point — `import … from '@mechanica/shared/page-format'`, deliberately **not** re-exported from the barrel: it pulls in the YAML parser, and the barrel is what the client runtime imports, so codec/YAML code must never reach the production bundle (only server-side callers — dev store, CLI, rich-text codec — import the subpath). The codec takes an optional `RichTextCodec` adapter so `richText` fields persist as Markdown `@field` regions on disk but stay `vuewrite` `Block[]` JSON in page state; the adapter (vuewrite-backed) is supplied by the caller — built from block schemas in `mechanica`'s `src/vite/rich-text-codec.ts` (dev server via `ssrLoadModule`, CLI export via its blocks list) — so `shared` stays vuewrite-free. Importable by the runtime and a future render service. **Keep it DOM-free.**
- **`dev-app`** — a playground site that exercises the plugin end to end. Its `.mech/` holds page/data fixtures the user actively edits in the browser; **leave those alone** unless asked.
- **`create-mechanica-app`** — the `npm create mechanica-app` / `bun create mechanica-app` scaffolder. The CLI (`index.js`) is deliberately plain, dependency-free, **Node-compatible JS** (`npm create` runs under Node). It copies the embedded `template/` (a pared-down dev-app: Hero + RichText blocks, head templating, a starter `.page.md`), renames `_gitignore` → `.gitignore` (npm strips real `.gitignore` files on publish), patches the project name, and prints next steps in the invoking package manager's flavor. Scaffolded apps run on plain Node (npm/pnpm/yarn) or Bun. Template deps pin **published** versions, never `workspace:*` — bump them when releasing `mechanica`. Scaffolded apps only install once `mechanica` v2 **and** `@mechanica/shared` are on npm (as of 2026-07 npm's `mechanica@latest` is still v1).

## Commands

```bash
bun install
bun run test                    # all suites (Vitest), from the repo root
bun run typecheck               # tsc --noEmit across packages
bun run build                   # dist builds (shared, then mechanica) — only needed for publishing/pack, never for repo dev
bun run --filter mechanica test
cd packages/dev-app && bun run dev      # bunx --bun vite (the editor playground)
cd packages/dev-app && bun run export   # mechanica build + static SSG → export/
```

Per-package scripts: `test` (`vitest run`), `test:watch`, `typecheck` (`tsc --noEmit`). The CLI bin is `packages/mechanica/bin/mechanica.js <build|export|push|shot>` (resolved as `mechanica …` inside `dev-app`).

There is no repo-wide lint. After non-trivial changes, run `bun run --filter mechanica test` **and** `bun run --filter mechanica typecheck` — both must stay green. `tsc --noEmit` does not check inside `.vue` templates/scripts, so also sanity-check components by booting the dev server (SCSS + `?svg-glob` only resolve through Vite, not tsc).

## How blocks compile (the core trick)

A block is a Vue SFC whose `<script setup>` calls the global **`defineBlock`** macro (no import). The Vite plugin runs `enforce: 'pre'` and rewrites it at the **source level** (`src/compiler/compile-block.ts`): `defineBlock({...})` → `defineProps([...]) + defineOptions({ blockId, blockSchema })`, then lets `@vitejs/plugin-vue` compile normally. This deliberately avoids v1's string-surgery on plugin-vue's internal `?vue&type=script` request URLs — the thing that pinned v1 to Vite 5. `defineBlock` is the **only** macro; `defineData` / `defineMechanicaApp` / `defineFieldType` are ordinary imported functions. Field types come from `compact-json-schema` with format aliases (`image`, `file`, `color`, `smartLink`, `multiselect`, `richText`) registered in `@mechanica/shared`.

Blocks are gathered into the `virtual:mechanica/blocks` module (`src/vite/collect-blocks.ts`).

**The production client build strips the metadata** (`stripMetadata` in `compileBlock` — only `defineProps` remains, no `defineOptions`): schemas and `previewData` feed the editor, the preview route and server-side default-filling, none of which load the client bundle. Dev and the SSR build keep full metadata. Defaults live at the **state level**, never at render time: `generatePage` bakes them into `window.state` at export, and `buildPageState` does the same in dev (`fillContentDefaults` in `pages-store.ts`), so a hand-authored `.page.md` that omits a defaulted prop renders identically in both.

## Block previews & `mechanica shot` (see your work!)

Full user-facing doc: [PREVIEW.md](./PREVIEW.md). The essentials:

A block can declare **`previewData`** in `defineBlock` — example prop values merged over schema defaults (`buildPreviewData` in `@mechanica/shared`). It feeds the palette hover preview and the standalone preview route, and doubles as documentation of what the block expects; give every new block meaningful `previewData`.

**Slots preview too:** a `$slots` key in `previewData` fills the block's slots with child blocks — `$slots: { start: [{ blockId: 'card', data: {…} }] }` — each child resolving its own `previewData`/defaults recursively (depth-capped). Slots without authored content render as labelled dashed placeholder boxes, so container/layout blocks are verifiable in shots. The content tree is built by `buildPreviewContent` (`src/core/preview.ts`), shared by the preview route and the palette hover preview.

**`GET /@mechanica/preview/<blockId>?data=<json>`** (dev) renders one block alone — real runtime context + the app's global CSS (the preview entry imports the user's app module without mounting it), site data fetched for `useData`. Readiness/errors are signaled via `window.__MECHANICA_PREVIEW_READY__` / `__MECHANICA_PREVIEW_ERROR__` (`src/core/preview.ts` `mountPreviewApp`, entry in `src/vite/entries.ts`, route in `src/vite/dev/preview.ts`).

**`mechanica shot <blockId>`** (from `dev-app`: `bun ../mechanica/bin/mechanica.js shot <blockId>`) screenshots that route headless and prints the PNG path plus any console/render errors. Flags: `--data <json|@file>`, `--width 1440,768,390`, `--out <path>`, `--server <url>`, `--browser <path>`, `--full`. Output defaults to `.mech/shots/` (gitignored). It reuses a running dev server (much faster — keep `bun run dev` running while iterating) or boots an ephemeral one, and drives a system Edge/Chrome over **raw CDP on the native WebSocket** (`src/cli/shot.ts`) — deliberately no Playwright/Puppeteer: their launch handshake uses Node-only fd pipes that hang under Bun.

**`mechanica shot </page/path>`** (a target starting with `/`, or `--page </path>`) screenshots a **whole page** instead: the real dev page with the editor overlay stripped (`?mechanica-shot` skips the `mechanica/editor` import in `transformIndexHtml`), full-page capture, page existence validated against the store (unknown paths fail listing the real ones). Use it to verify `.page.md` compositions — block spacing, shared data flowing in, `{{ }}` head templating.

**`mechanica thumbs [/prefix]`** walks every page (or those under a prefix) and writes 320px-wide top-of-page thumbnails to `.mech/thumbs/` (gitignored), which the dev middleware serves at `/@mechanica/thumbs/<slug>.png` and `PagesDialog` shows per row (monogram fallback when missing). **`mechanica thumbs --blocks [id]`** does the same for blocks: every palette-visible block renders through the preview route into `.mech/thumbs/blocks/<blockId>.png` (240px wide, clipped to the block's height), and the palette shows them on its cards (icon/monogram fallback). The block list comes from `GET /@mechanica/blocks`. A mostly-empty block thumbnail usually means missing `previewData`. Manual regeneration by design — run both after a content/styling session. Browser/CDP plumbing shared by all commands lives in `src/cli/headless.ts`.

**After creating or visually changing a block, run `mechanica shot <blockId>`; after authoring or editing a `.page.md`, run `mechanica shot </its/path>` — and Read the PNG before considering the work done.** Check spacing, overflow, and responsive behavior (`--width 1440,390`).

## Runtime, modes, and entries

State shape: `State { content: ContentBlock[], data, query, page }` (in `@mechanica/shared`). `createMechanica` provides a `MechanicaContext` (content / data / blocks / router / query / page) via `inject`. The runtime is **mode-aware via context** (`'client' | 'server' | 'dev'`) — there is **no `import.meta.env` branching** (a deliberate departure from v1).

The user exports `defineMechanicaApp({ root })`; the plugin generates entries (`src/vite/entries.ts`):
- `virtual:mechanica/client` → `createMechanicaApp(def, { mode, state, blocks }).mount('#app')`
- the SSR entry exports `render(state)` / `blocksList` / `dataEntries` (used by `mechanica export` and the future backend).

`mechanica build` runs two Vite builds; the SSR build writes the generated entry to a **real temp file** because rolldown (Vite 8's bundler) can't use a `\0`-virtual module as a build entry.

**Blocks are code-split in the client build** (dev + SSR stay eager): `virtual:mechanica/blocks` becomes a `blockLoaders` map of dynamic imports, the generated entry awaits only the blocks `window.state.content` uses (`loadBlocks` in `src/core/load-blocks.ts`) before mounting, and the router's `ensureBlocks` hook loads missing chunks before SPA content swaps. **Chunking is manual, not heuristic** (plugin option `blockChunks`): by default all blocks bundle into one `blocks` chunk + CSS file (`'bundled'` — one request, cached across pages, separate from the entry so editing a block never invalidates the Vue/runtime chunk); `'per-block'` restores one chunk per block. Either way, `chunk: '<name>'` in `defineBlock` carves the marked blocks into their own `blocks-<name>` chunk — use it for heavy, rarely-used blocks (see dev-app's rich-text blocks, which keep vuewrite off other pages). The plugin implements this as a rolldown `codeSplitting` group whose `name` callback walks each module's importers: a dependency folds into a blocks chunk only when *every* import path leads to blocks of that one group, so block-only helpers/libs ride along while anything the entry shares (Vue) stays put. The plugin emits `dist/mechanica-blocks.json` (blockId → `{ src, chunk }` — the containing output chunk, since bundled blocks have no per-block manifest keys) and the build enables Vite's manifest; `mechanica export` joins them by chunk file (`src/cli/page-assets.ts`) to inject per-page `<link rel="stylesheet">` + `<link rel="modulepreload">` tags, so each exported page loads exactly its own blocks' code with no extra round trip or unstyled flash.

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

**Rich-text widgets** (`fields/richtext/widgets.ts`): blocks that flow *inside prose* — built-ins image/code/callout/table, plus site-defined ones. A site declares a widget with **`defineWidget`** (imported from **`mechanica/widgets`**) in `src/widgets/*.ts` (plugin option `widgetsDir`); the plugin collects them into `virtual:mechanica/widgets`, imported **only by the editor entry**, so widget editing UIs never reach the site build. A widget is `{ type, title, icon, keywords?, create(), editor? }` — `icon` is a built-in VIcon name or a raw `<svg>` string (colors normalized to `currentColor`); the `editor` component receives `block` (mutate it directly), emits `change` to land in undo history, gets uploads/image-picking via `useWidgetServices()`, and renders behind an error boundary (a broken widget shows an inert chip, never kills the editor). On disk, widgets ride `vuewrite/markdown`'s generic forms (`<type attr="…"/>`, `:::type` fences) — keep extra block fields flat strings/booleans. Page rendering stays in user land: a `#<type>` slot on the site's `TextViewer` (see dev-app's `RichTextView.vue` + `src/widgets/cta-button.widget.ts` for the full pattern). The **table** widget wraps `vuewrite/table`'s `TableEditor` (`RichTableWidget.vue`; persists as a GFM pipe table, header row first, cells keep inline styles) — it gets the hosting editor's ref via the internal `richTextEditorRefKey` provide so cell edits push history and Delete removes the block; sites render tables with `TableViewer` in their `#table` slot (structural CSS from `vuewrite/style.css`, themed per side).

**Page management:** `PageBar` (sidebar) shows the current page and opens `PagesDialog` — a searchable, folder-grouped browser that scales to hundreds of pages, with **per-row** Rename (inline) / Duplicate / Delete. There is no `<select>` dropdown and no ambient "current page" actions.

**Links on the live page are followable:** clicking a link inside a block follows it instead of selecting the block — internal links go through the editor's in-place page switch (`use-block-frames.ts` `linkClickAction` + `navigation.switchPage`), so the save path, page version and undo history move with the page; modified clicks, `target="_blank"`, downloads, external and same-page hash links keep native browser behavior. Blocks are selected by clicking non-link areas (or the hierarchy tree). Saves target the state's `page.path`, never the raw URL — on a paginated variant URL (`/blog/2`) edits save to the base page.

`vuesix` and `vuewrite` are the **user's own** libraries. `vuesix` is composables/utilities only (no UI components); `vuewrite` provides the `TextEditor` for rich text.

## Styling (Sass design system)

Light theme only, modern, with **black pill primary buttons** — based on the legacy look, modernized. **Use Sass.** Design tokens are CSS custom properties (`--mech-*`) in `styles/_variables.scss`. Shared primitives + editor chrome live in `styles/editor.scss` (`.mech-button` neutral, `.mech-button.is-primary` black, inputs, tabs, frames, toolbar, drag indicators). **Component-specific styles go in the component** as `<style lang="scss" scoped>` (PageBar, PagesDialog, HierarchyTree, BlockPalette, DataSettings, the dialogs, …). Consume tokens via `var(--mech-*)` — no per-file `@use` needed. Don't reintroduce a dark theme without being asked.

## Icons (VIcon + svg-glob)

Icons are individual `*.svg` files under `src/editor/icons/`, bundled as raw strings by the **`?svg-glob`** Vite plugin (`src/svg-plugin.ts`), which normalizes hard-coded colors to `currentColor` and strips `xmlns`. `VIcon.vue` imports `../icons?svg-glob` and renders `<VIcon name="filename" />`. **To add an icon:** drop a `*.svg` in `icons/` (e.g. a Figma export) and reference it by filename; size it via CSS (`.vicon` defaults to `1em`). The plugin is registered in `dev-app/vite.config.ts` and **both** projects of `packages/mechanica/vitest.config.ts` (DOM tests render real icons), and re-exported as `svgGlob` from `mechanica/plugin`. There is a `*?svg-glob` type shim in `src/vue-shim.d.ts`.

## Page `<head>` metadata (defineData + templating, not a panel)

Per-page `<head>` (title, description, Open Graph, any tag) is **ordinary data**, not a bespoke editor concept. Define a **page-scoped `defineData`** entry (e.g. `head` with `title`/`description`) and template it into `index.html` with `{{ head.title }}` placeholders. The engine is `passDataToHTML` in `@mechanica/shared` (HTML-escapes resolved values); it runs at **build** (`generatePage`) and in **dev** (`transformIndexHtml`), so the two match. `{{ page.path }}` etc. also work (e.g. canonical URLs). Small landing pages can just hardcode their `<head>`. Edit the values in the editor's **Page data** window. (`updatePageMeta` was removed; `renamePage` only changes a page's editor label.)

## Queries & pagination

`usePages(filter)` lists the site's pages — `folderName`, embedded `data` hooks, `sort` by `'name'`/`'path'`/a data field (`'postMeta.date'`), `limit`. `usePagination({ …, pageSize })` returns a reactive pager (`items`/`page`/`pageCount`/`total` + `pathFor(n)`/`prevPath`/`nextPath`). `useFetch({ url })` fetches external JSON — always **server-side** (dev server proxies, export bakes at build time). One **query engine** lives in `@mechanica/shared` (`query-engine.ts`, pure over a `QuerySource` interface) with three callers: the dev server (`GET /@mechanica/query`, live against `.mech`; the generated dev entry passes `resolveQuery`), `mechanica export` (resolved at build time, memoized per key across the run, baked into `window.state.query` so the production client hydrates synchronously with no refetch), and the future hosted backend. The SSR contract is `render(state, { resolveQuery }) → { html, query }`.

**Pagination produces real pages.** At export, a page whose paginated query has N chunks also renders `/path/2` … `/path/N` — each a real HTML file with its own slice and `state.page.pagination`, present in the sitemap; a genuine page already at a variant path fails the export loudly. Dev serves variant URLs virtually: `buildPageState` maps `/blog/2` to the `/blog` page plus pagination context (`page.path` stays the base, so editing a variant edits the real page), and `mechanica shot /blog/2` works. A folder's own index page is excluded from its `folderName` listing. Queries resolve at block mount (no live re-query when the store changes — reload to refresh); SPA/pager navigation re-runs them, because `<Content>` keys blocks by pagination page (variants share content-node ids) and the router applies the target page's `page` meta + baked `query` results before the content swap. Reference demo: dev-app `/blog` — `BlogList.vue` (folder-scoped, pager UI), `src/data/post-meta.ts`, nine posts under `.mech/pages/blog/`.

## Data scoping

`defineData` entries carry a `scope`: `'site' | 'folder' | 'page'`. On save the dev server **splits** the data by scope (`data-store.ts` `splitDataByScope`): site → `.mech/data.json`, folder → `.mech/folders.json` (keyed by folder), page → the page file. Dev inject and static export **merge** site + the page's folder data back over the page's own data, so a value is authored once and shared correctly. The editor's "Edit page data" window edits all scopes (sorted site → folder → page).

## Conventions

TypeScript strict, ESM, named exports for the public API. **kebab-case** for TS modules, **PascalCase** for `.vue`. Tests are under each package's `test/` (mirroring `src/`), `*.test.ts` (Node) / `*.dom.test.ts` (jsdom), importing source via the `@/` alias; the mechanica Vitest config has two projects and a `@mechanica/shared` → source alias (mirrored by tsconfig `paths`). Prefer pure, unit-testable helpers in `lib/` over logic embedded in components. English everywhere. `.vue` / `.css` / `.scss` / `*?svg-glob` imports are covered by `src/vue-shim.d.ts`; virtual modules by `src/virtual-modules.d.ts`.

When you change something, keep tests + typecheck green and add coverage. The legacy v1 lives in the sibling **`mechanics`** repo (reference only — don't edit it).
