# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Mechanica** is a platform for building Vue 3 websites with a visual block editor. Authors write Vue SFC "blocks", an in-page editor arranges them into pages, and pages render server-side (static export or backend). This is the **v2 rewrite** — built ground-up on **Vite 8 / Vue 3.5 / Vitest 4 / Bun**, English throughout, test-covered. See [PLAN.md](./PLAN.md) for the full design rationale.

Everything runs on **Bun**. Use `bun`/`bunx`, not `npm`/`node`. Vite/Vue configs are loaded via `bunx --bun vite` because the workspace packages ship TS source with extensionless relative imports that raw Node ESM can't resolve.

## Monorepo layout

Bun workspaces under `packages/*`:

- **`mechanica`** — the published package. Contains the block **compiler**, the **runtime** (`src/core/`), the **Vite plugin** (`src/vite/`), the in-browser **editor** (`src/editor/`), and the **CLI** (`src/cli/`).
- **`shared`** (`@mechanica/shared`) — DOM-free types, the field-type registry, schema/default helpers, and the page-generation (SSG) core. Importable by the runtime and a future SAAS render service. Keep it DOM-free.
- **`dev-app`** — a playground site that exercises the plugin end to end.

## Commands

```bash
bun install
bun run test                 # all suites (Vitest)
bun run --filter mechanica test
cd packages/dev-app && bun run dev      # bunx --bun vite
cd packages/dev-app && bun run export   # build + static SSG → export/
```

Per-package: `bunx vitest run` · `bunx tsc --noEmit` (typecheck) · CLI = `bun packages/mechanica/bin/mechanica.js <build|export|push>`.

## How blocks compile (the core trick)

A block is a Vue SFC whose `<script setup>` calls the global **`defineBlock`** macro (no import). The Vite plugin runs `enforce: 'pre'` and rewrites it at the **source level** (`src/compiler/compile-block.ts`): `defineBlock({...})` → `defineProps([...]) + defineOptions({ blockId, blockSchema })`, then lets `@vitejs/plugin-vue` compile normally. This deliberately avoids v1's string-surgery on plugin-vue's internal `?vue&type=script` request URLs — the thing that pinned v1 to Vite 5. `defineBlock` is the **only** macro; `defineData`/`defineMechanicaApp`/`defineFieldType` are ordinary imported functions.

Blocks are gathered into the `virtual:mechanica/blocks` module (`src/vite/collect-blocks.ts`).

## Runtime, modes, and entries

State shape: `State { content: ContentBlock[], data, query, page }` (in `@mechanica/shared`). `createMechanica` provides a `MechanicaContext` (content/data/blocks/router/query) via `inject`. The runtime is **mode-aware via context** (`'client' | 'server' | 'dev'`) — there is **no `import.meta.env` branching** (a deliberate departure from v1).

The user exports `defineMechanicaApp({ root })`; the plugin generates entries (`src/vite/entries.ts`):
- `virtual:mechanica/client` → `createMechanicaApp(def, { mode, state, blocks }).mount('#app')`
- the SSR entry exports `render(state)` / `blocksList` / `dataEntries` (used by `mechanica export` and the future backend).

`mechanica build` runs two Vite builds; the SSR build writes the generated entry to a **real temp file** because rolldown (Vite 8's bundler) can't use a `\0`-virtual module as a build entry.

## Dev server & editor

The plugin's `configureServer` mounts the `/@mechanica` middleware (`src/vite/dev/`: `pages-store`, `assets-store`, `query-dev`, `middleware`) for page CRUD, asset upload/serve, and query resolution over `.mech/`. `transformIndexHtml` injects `window.state` + the client entry + `mechanica/editor` in dev (client entry only in build).

The **editor** (`src/editor/`) is an in-page overlay. `createMechanica` exposes the live runtime through a versioned **bridge** (`bridge.ts`); the editor pushes edits (live preview) and debounce-saves to `/@mechanica/save`. Structure: a reactive `store.ts`, the sidebar (`BlockPalette`/`HierarchyTree`/`BlockSettings`), the recursive `props-panel/` (`SchemaForm`/`SchemaField`/`ArrayField`), and the field-editor registry (`fields/`, incl. richText via `vuewrite`). `vuesix`/`vuewrite` are the user's own libraries; `vuesix` is composables/utilities only (no UI components).

## Conventions

TypeScript strict, ESM, named exports for the public API. **kebab-case** for TS modules, **PascalCase** for `.vue`. Tests are co-located `*.test.ts` (Node) / `*.dom.test.ts` (jsdom); the mechanica Vitest config has two projects and a `@mechanica/shared` → source alias (mirrored by tsconfig `paths`). English everywhere. `.vue`/`.css` imports are covered by `src/vue-shim.d.ts`; virtual modules by `src/virtual-modules.d.ts`.

The legacy v1 lives in the sibling `mechanics` repo (reference only).
