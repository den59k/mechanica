# Mechanica — Rewrite Plan (v2)

> Fresh standalone repo **`mechanica`** (`C:\Users\Den\Desktop\CURVES\mechanica`). Ground-up rewrite of the plugin + local-dev tooling, built on **Vite 8 / Bun**, English throughout, **test-covered from the first commit**. Keeper UI/components are *ported and translated* from the legacy repo, not rewritten.

## 1. Context & scope

- New repo, no legacy baggage. The old `mechanics` repo (`backend-old` / `frontend-old`) is reference-only.
- Everything is being rewritten (plugin now; backend + frontend + SAAS later) → **no backward-compatibility constraints.** We improve the authoring syntax freely (see §3).
- **Current focus: local development** — the Vite plugin, block compiler, dev server (`/@mechanica`), HMR, the in-browser overlay editor, and `mechanica build` / `export`.
- **Backend / SAAS deferred:** `mechanica push` keeps producing a runnable SSR bundle, but the deploy/render contract is co-designed later with the hosted SAAS service. Design boundaries clean now; don't build it yet.
- **Copy, don't rewrite:** the legacy `common/` editor UI (dialogs, rich-text editor, hierarchy, blocks editor, hover frames), `dev-app` blocks, `.mech` fixtures, and the SSG/schema utilities are ported + translated, not rebuilt from zero.

## 2. Stack & tooling

- **Vite 8**, `@vitejs/plugin-vue` 6, **Vue 3.5**, **Bun**, **TypeScript** (strict), modern Sass API (`@use`/`@forward`).
- **Vitest 4**, two projects: `node` (compiler, dev server, CLI helpers) and `jsdom` (runtime, editor, components).
- Tests **co-located** as `*.test.ts` next to source; shared SFC inputs in `test/fixtures/`.
- File naming: **kebab-case** for TS modules, **PascalCase** for `.vue` components. Named exports for the public API; TSDoc on the public surface. English only.

## 3. Authoring syntax — the changes

No backward-compat to preserve, so the developer-facing API is modernized. These are decisions for the rewrite (adjust as needed).

> **Macro vs. imported function.** Only **`defineBlock`** is a compiler macro — no import, used inside a block's `<script setup>`, transformed at compile time (like `defineProps`). **`defineData`, `defineMechanicaApp`, `defineFieldType`** are ordinary **imported** functions used in regular `.ts` files; the `define*` name is just convention (cf. Pinia `defineStore`, Vite `defineConfig`). The block compiler (§5.1) therefore transforms **only** `defineBlock` calls in `.vue` files and leaves the others to resolve at runtime.

### 3.1 `defineBlock` — keep the macro, enrich the descriptor
Stays a no-import compiler macro (consistent with Vue's `defineProps`). Metadata becomes first-class; fields gain optional editor hints + defaults.

```vue
<script setup lang="ts">
const props = defineBlock({
  name: 'Our Features',
  category: 'Content',          // was `group`; editor palette grouping
  icon: 'grid',
  description: 'A row of feature cards',
  props: {
    features: {
      type: 'array',
      label: 'Feature list',     // per-field label/description/default supported
      items: { title: 'string', subtitle: 'text' },
    },
  },
  slots: ['default'],            // explicit; auto-detected from <slot> if omitted
})
</script>
```
`id` auto-derives from the filename unless given.

### 3.2 Unified field-type registry
Today a new editable field type needs three edits in three files (runtime alias + TS `SchemaTypesMap` + editor control). Collapse the runtime + editor halves into one registration:

```ts
export const videoField = defineFieldType({
  name: 'video',
  schema: { type: 'object', properties: { src: 'string', poster: 'string?' } },
  editor: VideoFieldEditor,     // Vue component in the props panel
})
registerFields([imageField, colorField, videoField /* … */])
```
Caveat: the *type* half still needs a co-located `declare module` augmentation (TS can't infer a macro type map from runtime registration), but it lives next to the field definition instead of in a central file.

### 3.3 Explicit app entry (removes the SSR regex hack)
No more rewriting `createApp`→`createSSRApp` / stripping `.mount()`. One factory, from which the plugin generates the client and SSR entries deterministically:

```ts
import { defineMechanicaApp } from 'mechanica'
import App from './App.vue'

export default defineMechanicaApp({
  root: App,
  setup(app) { app.use(createPinia()) },   // optional plugin registration
})
```

### 3.4 `defineData` — imported function, first-class scope
A regular imported function used in a standalone data module (not a macro). It returns a reusable hook that components import and call:
```ts
// data/header.ts
import { defineData } from 'mechanica'

export const useHeader = defineData({
  id: 'header',
  scope: 'site',                // 'site' | 'folder' | 'page' (was tracked separately)
  props: { logo: 'image', links: { type: 'array', items: { title: 'string', url: 'smartLink' } } },
})

// in a component:  const header = useHeader()
```

### 3.5 Schema engine
Keep **`compact-json-schema`** — purpose-built (compact, runtime-introspectable, alias-able). Zod/Valibot were considered but add friction for editor metadata. Custom formats (`image`, `file`, `color`, `smartLink`, `multiselect`, `richText`) move into the field registry (§3.2). Fields gain optional editor metadata in object form — `label`, `description`, `default`, `placeholder` — while the bare-string form (`title: 'string'`) still works.

### 3.6 Runtime components & composables
- **One `<Link>`** replaces the public `RouterLink` (which name-clashes with vue-router's) **and** `SmartLink`. Accepts a string path or a `smartLink` object (`{ url, title, external, openNewTab }`); internal → SPA nav, external → `<a>`, new-tab aware.
- **Split `useQuery`** (string-discriminated `'getPages'`/`'fetch'`) into typed composables **`usePages(filter)`** and **`useFetch(options)`**.
- **`usePageData()`** returns the full current-page state (title/path/meta/data), properly typed (legacy mistypes it as `{ path }`).
- **`<Content>`** keeps rendering the block tree.
- **Trim generics** (`cn`, `pick`) out of the package root into a **`mechanica/utils`** subpath.

Target public surface — **Macros:** `defineBlock`, `defineData`, `defineMechanicaApp` · **Components:** `<Content>`, `<Link>` · **Composables:** `useRouter`, `useRoute`, `usePages`, `useFetch`, `usePageData` · **Extension:** `defineFieldType`, `registerFields` · **Subpath:** `mechanica/utils`.

## 4. Package structure

```
mechanica/
  package.json            # Bun workspaces root
  tsconfig.base.json
  PLAN.md  README.md
  packages/
    mechanica/            # the published plugin + runtime + editor + CLI
      src/
        core/             # defineBlock, defineData, defineMechanicaApp, state, router, Content
        compiler/         # source-level block macro transform (+ *.test.ts)
        fields/           # built-in field types (schema + editor + type) via the registry
        vite/             # the Vite plugin: virtual modules, dev middleware, build
        editor/           # overlay editor app + versioned bridge (ported UI)
        cli/              # mechanica build | export | push
      test/fixtures/
    shared/               # @mechanica/shared: types, schema helpers, page generation (DOM-free)
    dev-app/              # playground site (ported blocks + .mech fixtures)
```

## 5. Internal architecture decisions

### 5.1 Block compiler — source-level macro transform (the key de-risk)
Replace the legacy string-surgery on plugin-vue's `?vue&type=script` sub-requests with a **`enforce:'pre'` transform on the raw `.vue`** that rewrites our macro into Vue's native macros, then lets plugin-vue compile normally:

```
const props = defineBlock({ id:'x', props:{ title:'string' }, slots:['default'] })
```
→
```
const props = defineProps(['title'])
defineOptions({ blockId: 'x', blockSchema: { /* original descriptor */ } })
```
- Parse the SFC with `@vue/compiler-sfc` `parse`; edit the `<script setup>` via `MagicString`; find the `defineBlock` call via `babelParse` + `estree-walker`.
- Slot names from the **template AST** (`<slot>` elements), not regex on compiled output.
- No dependence on plugin-vue internals or plugin ordering beyond `enforce:'pre'`. The component carries `blockId`/`blockSchema` via `defineOptions`, readable by the editor and SSR introspection.

### 5.2 Dev server — Environment API + typed middleware
`/@mechanica` middleware restructured into a typed handler map (pages CRUD, assets, query) with English errors. HMR/module-graph via Vite's Environment API (`hotUpdate`, `this.environment.moduleGraph`), not the deprecated `server.moduleGraph` / `handleHotUpdate`.

### 5.3 Build / entry — explicit dev/ssr/client
Drive client + SSR builds from the `defineMechanicaApp` factory (§3.3) and a generated virtual entry. Drop the `disableViteDefinePlugin` hack; branch via explicit build flags / `exports` conditions rather than relying on consumer `import.meta.env` resolution. Migrate `.sass` `@import` → `@use`.

### 5.4 Editor — in-page overlay + versioned bridge
Keep the overlay (direct reactive mutation of the live app = instant updates, no full-app serialization). Extract a single **typed, versioned bridge module** shared by the editor and updater, replacing the loose `postMessage` + `window.__MECHANICA_STATE__` handshake. iframe isolation documented as a future option.

### 5.5 Shared boundary
`@mechanica/shared` holds types, schema helpers, and the page-generation (SSG) core — **DOM-free** so the future SAAS render service can import it cleanly. Editor-only Vue components live in `packages/mechanica/src/editor`.

## 6. Testing strategy (first-class, every phase)

Runner: **Vitest** (node + jsdom). A phase isn't done until its gate is green *with tests*. Highest-value targets:

**Compiler / build (node):**
- Block macro transform — schema extraction, `id` derivation, slot detection, `defineProps`/`defineOptions` output. Snapshot + assertions. *(Replaces the legacy `babelTest.ts`.)*
- Field registry — each built-in field unfolds to the right schema + type.
- Block collection (virtual module) — scans `src/blocks`, dedups, emits stable imports.

**Dev server (node, temp-dir fixtures):**
- Page-path resolution (trailing/leading slash, dir→`index.json`).
- Page CRUD — duplicate detection, save merge, folders.
- Available-pages sort comparator (`folderPath`/`order`/`orderAfter`) — table-driven.
- Query cache + `getPages` filtering; unique-filename suffixing.

**Runtime / editor (jsdom):**
- Page generation (SSG core) — defaults, data scoping, query resolution, multi-page, asset rewriting. *(Shared with future SAAS — keep well-covered.)*
- State processing — `data-block-id` assignment, defaults, scope splitting.
- Block rendering — tree→VNode, slots, missing-block handling.
- Router — path normalization / base-URL handling.
- Editor bridge — postMessage round-trip + state-merge semantics.

**Integration / golden:**
- Boot the dev server against `dev-app`, assert injected `window.state` + editor scripts.
- `mechanica export` golden test on a fixture site.

## 7. Phases

Each phase ships its tests and translates any ported code as it lands.

- **Phase 0 — Scaffold + compiler spike.** Stand up the repo (Bun workspaces, Vite 8, Vitest), then build + test the source-level block compiler in isolation. *Gate: compiler compiles all `dev-app` blocks; tests pass.*
- **Phase 1 — Shared + harness.** `@mechanica/shared` (types, schema helpers, SSG core), Vitest node+jsdom projects, English baseline. *Gate: builds, types, empty suites run.*
- **Phase 2 — Vite plugin.** Compiler integration, field registry, virtual modules, Environment-API plumbing, build/entry, Sass migration. *Gate: `dev-app` dev server renders + HMR; compiler/collection tests pass.*
- **Phase 3 — Dev server + editor.** Typed `/@mechanica` middleware, versioned bridge, ported + translated editor UI. *Gate: live edit + save round-trip; server + bridge + editor tests pass.*
- **Phase 4 — CLI.** `mechanica build` / `export` on the new entry contract; `push` kept working (no contract change). *Gate: export golden test passes.*
- **Phase 5 — End-to-end.** Port `dev-app` fully; dev-edit → build → export locally. *Gate: integration + export smoke green.*
- **Phase 6 — Docs & publish prep.** README, `.mech` format notes + migrator, version bump.
- **Later (separate) — SAAS integration.** Co-design and version the push/render contract with the hosted service.

## 8. Top risks

1. **Source-level macro extraction** must handle every `defineBlock` shape (nested schemas, aliases, slots, optional metadata) — the Phase 0 spike + compiler suite de-risk this.
2. **Field-registry typing** — runtime unification is clean, but the TS map still needs co-located `declare module` augmentations; verify `defineBlock` prop inference still works.
3. **Explicit entry / build-flag scheme** changes how the package is consumed — verify client vs SSR builds resolve correctly before publishing.
4. **`@mechanica/shared` must stay DOM-free** so the future SAAS render side can import it.
5. **SSR bundle still runnable** by a future backend — keep the introspection/render output stable even though the backend isn't built now.
