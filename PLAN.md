# PLAN: Block Composer (composed blocks)

Status: **Stages 0–1 complete & verified. Stage 2 (parameterization + palette integration) next.**
Owner docs: this file. Companion specs: [CLAUDE.md](./CLAUDE.md) (architecture), [CONTRACT.md](./CONTRACT.md) (`.page.md`), [PREVIEW.md](./PREVIEW.md) (shots/previews).

## Progress

- **Stage 0 — DONE.** Composed blocks authored by hand as `.mech/blocks/<id>.block.yml`
  render through the normal pipeline in dev, SSR and static export; the four
  elements (`mech:frame`/`text`/`image`/`button`) ship with the runtime;
  responsive `$bp` overrides bake to CSS-variable media-query chains; `$bind`
  props resolve; the dev CRUD store + `/@mechanica/composed*` endpoints exist;
  `mechanica shot <id>` and `mechanica shot /page` both render composed blocks.
  Verified end-to-end via `dev-app`'s `hero-banner.block.yml` + `/composed-demo`
  page (export HTML + 1440/390 shots).
- **Stage 1 — DONE.** The Composer UI at `/@mechanica/composer/<id>` (or `~new`):
  full-screen dev app (`mechanica/composer` export → `src/editor/composer/`).
  Shell with name field, breakpoint switcher (1440/768/390), zoom, undo/redo,
  save status. Left panel: insert palette (Frame/Text/Image/Button) + layers
  tree. Center: live canvas (renders `def.template` via `renderBlocks`, click to
  select with a CSS-outline overlay, breakpoint preview by **pre-merging** `$bp`
  overrides so it works without viewport media queries). Right: inspector with
  Content / Layout / Size (hug·fill·fixed) / Typography / Style / Image / Button
  sections; responsive edits write to the active breakpoint layer. Store
  (`composer-store.ts`) reuses `content-tree` ops; history + debounced
  create-then-update save (`composer.ts`). Verified in a headless browser:
  loaded `hero-banner` (5 canvas blocks, no console errors), mobile breakpoint
  applied the 32px title override, and a from-scratch build (Frame › Text ›
  Button, edited content) saved to `.mech/blocks/composer-test.block.yml`.
  Known Stage-2 gaps: a `$bind` field shows its resolved preview value and edits
  to it replace the binding with a literal (no bind UI yet); no drag-reorder in
  the canvas (use layers + move); no inline canvas text editing (inspector only).
- **Stage 2 — TODO.** Prop exposure (`⚡ Expose as prop` → schema + previewData),
  `composable: true` code blocks in the insert palette, page-editor palette
  "Site blocks" section + New/Edit/Delete entry points, `thumbs --blocks`.
- **Stage 3 — TODO** (breakpoint override affordances, `$abs` dragging, token-first
  colors, "save selection as block", delete-with-usage-warning).

**`bun run build` must run before an export/pack** — the `mechanica-shared/block-format`
subpath and `mechanica/composer` entry are dist entries.

## 1. What we are building

A visual **block constructor** ("Block Composer") that lets a designer assemble a
*static* page block — no JS logic — out of layout primitives (flex "autolayout",
Figma-style) and developer-provided Vue components, directly in the local dev
editor. The result is a first-class block: it appears in the palette, is placed
on pages, gets a schema-driven settings form, exports statically, and works with
`mechanica shot` / `thumbs`.

**The core insight that makes this cheap:** the runtime already renders an
arbitrarily nested `ContentBlock` tree (`renderBlocks` recurses through named
slots and stamps `data-block-id` on every node). So a composed block is **not a
new kind of code — it is data**: a named, parameterized `ContentBlock` subtree
saved as a file. It never compiles; it *expands* at render time through the
exact same pipeline pages use. WYSIWYG is guaranteed by identity of code, not
similarity.

Consequently there is **no third entity for "components usable in the
composer"** — those are ordinary blocks (`defineBlock`), opted in with a flag.
The only new entity is the composed-block definition itself.

### Philosophy (vs Tilda Zero Block)

Zero Block is absolute-first: the designer lays out every breakpoint by hand.
We are **flex-first**: autolayout gives responsiveness by construction; absolute
positioning is a constrained escape hatch for decoration *inside a frame*, never
a canvas mode. Less freedom, an order of magnitude fewer broken mobile layouts.

### Naming (final)

| Concept | Name in code |
|---|---|
| The entity | `ComposedBlock` / "composed block" |
| The editor UI | Block Composer (`ComposerApp`, route `/@mechanica/composer/<id>`) |
| On-disk files | `.mech/blocks/<id>.block.yml` |
| Layout primitives | element blocks, ids namespaced `mech:frame`, `mech:text`, `mech:image`, `mech:button` |
| Code components opt-in | `composable: true` in `defineBlock` |
| Dev store | `composed-store.ts`, endpoints under `/@mechanica/composed` |
| Virtual module | `virtual:mechanica/composed` |

Avoid: `defineComponent` (Vue), `Template` (Vue-overloaded), `CustomBlock`
(meaningless — all blocks are custom).

## 2. Data model

### 2.1 Definition (in `mechanica-shared`, DOM-free)

```ts
/** A designer-assembled block: a parameterized ContentBlock subtree. */
export interface ComposedBlockDefinition {
  id: string                          // stable, kebab-case, unique vs compiled blocks
  name: string
  icon?: string                       // VIcon name
  category?: string                   // palette group; default 'Site blocks'
  /** compact-json-schema generated from exposed props (see §2.3). */
  props?: Record<string, unknown>
  /** Canvas values at save time double as preview data (palette hover, shot). */
  previewData?: Record<string, unknown>
  /** The template: element/block nodes; data values may be bindings (§2.3). */
  template: ContentBlock[]
}
```

The template reuses `ContentBlock` verbatim — same `children` slot shape, same
tree utilities (`walkTree`, `content-tree.ts` ops in the editor).

### 2.2 Reserved `$`-prefixed keys inside a node's `data`

Consistent with the existing `$slots` convention in `previewData`:

- **`$bp`** — responsive overrides: `{ md?: Partial<data>, sm?: Partial<data> }`.
  Base values are desktop; `md` applies ≤ 1024px, `sm` ≤ 640px (constants in
  shared; configurable later). **The data model carries `$bp` from day one**
  even while the override UI is minimal — retrofitting it is a painful
  migration.
- **`$abs`** — absolute positioning of a child inside its parent frame:
  `{ anchor: 'top-left' | 'top' | … | 'center', x: number, y: number, z?: number }`.
  Only meaningful on children of `mech:frame`. No absolute at canvas root.

### 2.3 Prop bindings

A bindable value in the template is replaced by `{ $bind: '<propName>' }`
(top-level data keys only in v1 — no path expressions, no computed). Exposing a
prop in the composer:

1. writes `{ $bind: name }` into the node's data,
2. adds a field of the right type to `definition.props`
   (string / text / image / smartLink / boolean),
3. records the current canvas value as the schema `default` **and** into
   `previewData`.

Bindable in v1: text content, image src, link, button label/variant, element
visibility (boolean → conditional render). Everything else stays baked.

Resolution is a pure shared function:

```ts
/** Deep-clone template, substitute $bind from props, drop $-keys the runtime
 *  components consume, namespace node ids under `instanceId` (stable vnode
 *  keys per placed instance). */
export function resolveComposedTemplate(
  def: ComposedBlockDefinition,
  props: Record<string, unknown>,
  instanceId: string,
): ContentBlock[]
```

## 3. On-disk format & codec

**File:** `.mech/blocks/<id>.block.yml` — one YAML document:

```yaml
name: Hero Banner
icon: hero
props:
  title: { type: string, title: Title, default: Build faster }
  image: { type: string, format: image, title: Image }
template:
  - blockId: mech:frame
    data: { direction: column, gap: 24, padding: [64, 48], background: '#f6f6f4' }
    children:
      - blockId: mech:text
        data: { tag: h1, content: { $bind: title } }
      - blockId: mech:image
        data: { src: { $bind: image }, fit: cover, radius: 12 }
```

Rationale: whole-file YAML (not `.page.md`-style Markdown) because the payload
is a structured tree, v1 text is plain strings, and one parser keeps the codec
trivial. If rich text lands inside `mech:text` later, revisit a `.block.md`
hybrid then. Human-readable, git-diffable, Claude-authorable — this is also the
answer to "a developer can build/sync these too": the file rides git and the
`mechanica push` bundle exactly like pages.

**Codec:** `packages/shared/src/block-format.ts` —
`parseComposedBlock(text): ComposedBlockDefinition` /
`serializeComposedBlock(def): string`. Exported as the subpath
`mechanica-shared/block-format`, **not** re-exported from the barrel (same rule
and same reason as `page-format`: it pulls the YAML parser, and the barrel is
what the client runtime imports). Parse must validate: unknown `blockId`s are
kept (renderBlocks tolerates), malformed YAML/shape throws with file+reason.

## 4. Runtime rendering

### 4.1 Element blocks (`mech:*`)

Live in `packages/mechanica/src/elements/` as plain render-function components
(`h()`, no SFC — keeps them out of the block compiler pipeline). Registered
into every `BlocksMap` unconditionally by `createMechanica`
(`registerElements(blocks)`) — dev, SSR, client, preview. They are a few KB;
accept that they ship even when unused (revisit if it ever matters).

Element specs (props = their `data`):

- **`mech:frame`** — the only container; flex always on (a Figma frame with
  autolayout). `direction`, `gap`, `align`, `justify` (9-point), `wrap`,
  `padding` (1/2/4 values), `background` (color | image), `radius`, `border`,
  `shadow` (preset key), `minHeight`, `overflow`, per-axis size mode (§4.2).
  Slot: `default`. The composed block root is a frame with a "section behavior"
  toggle (full-bleed vs content max-width).
- **`mech:text`** — `tag` (h1–h4 | p | caption), `content` (plain string v1),
  `size`, `weight`, `lineHeight`, `color`, `alignText`, `maxWidth`.
- **`mech:image`** — `src`, `alt`, `fit`, `ratio`, `radius`, size mode.
- **`mech:button`** — `label`, `link` (smartLink shape), `variant`
  (primary | secondary | ghost), rendered as `<a>`/`<button>` via the runtime
  link helper (`src/core/link.ts`) so editor link-following and SPA routing
  behave like any block.

### 4.2 Size model: Hug / Fill / Fixed

Per axis on every element — the single UX pattern adopted wholesale from Figma
because it is what makes autolayout learnable:

- **hug** → size by content (default),
- **fill** → `flex-grow: 1` / `align-self: stretch` on the cross axis,
- **fixed** → explicit px (or %).

Stored as `w: 'hug' | 'fill' | number`, `h: same`. A "spacer" is an empty
fill-frame; there is no Spacer element.

### 4.3 Responsive without JS: custom-property CSS

Static export must be real responsive CSS, not runtime switching. Strategy:
**one static stylesheet + per-node inline custom properties.**

`elements.scss` (shipped with the runtime, imported once) defines, per element:

```css
.mxel-frame {
  display: flex;
  flex-direction: var(--el-dir, column);
  gap: var(--el-gap, 0px);
  /* … */
}
@media (max-width: 1024px) {
  .mxel-frame { flex-direction: var(--el-dir-md, var(--el-dir, column)); /* … */ }
}
@media (max-width: 640px) {
  .mxel-frame { flex-direction: var(--el-dir-sm, var(--el-dir-md, var(--el-dir, column))); /* … */ }
}
```

Each element component maps `data` + `data.$bp` to inline
`style="--el-dir: row; --el-dir-sm: column; …"`. SSR-safe, hydration-safe, zero
client JS, and the composer canvas gets breakpoint preview for free by just
narrowing the canvas width. The var-mapping helper is pure and unit-tested
(`packages/mechanica/src/elements/style-vars.ts`).

`$abs` maps the same way (`position: absolute` + anchor/offset vars; the parent
frame sets `position: relative`).

### 4.4 The composed component factory

`packages/mechanica/src/core/composed.ts`:

```ts
/** Wrap a definition as a Vue component: resolves bindings, renders the
 *  template through renderBlocks with the ambient BlocksMap. */
export function createComposedComponent(def: ComposedBlockDefinition): Component
```

Implementation: a functional/`defineComponent` wrapper that reads props (typed
loosely; the schema is metadata), calls `resolveComposedTemplate`, and returns
`renderBlocks(resolved, blocks)` where `blocks` comes from the injected
`MechanicaContext`. It must also carry the definition as component metadata
(mirroring what `toBlockMeta` reads from compiled blocks: `blockId`,
`blockSchema`) so the editor palette / settings form / default-filling treat it
identically to a compiled block.

Nested composed blocks (composed inside composed) are **rejected in v1** at
save/parse time (clear error) — the model allows it, the UX questions (cycles,
edit-in-place) come later.

### 4.5 Distribution: `virtual:mechanica/composed`

A new virtual module, loaded by the plugin from `.mech/blocks/*.block.yml` via
the shared codec:

```js
export const composedList = [ /* parsed definitions as JSON literals */ ]
```

Consumers (all four generated entries in `src/vite/entries.ts`):

- **client / dev entry** — `createMechanicaApp(def, { …, composed: composedList })`;
  `createMechanica` registers `createComposedComponent(d)` into the BlocksMap
  and elements alongside.
- **SSR entry** — same registration; additionally `export { composedList }` so
  `mechanica export` can fill schema defaults and previews can enumerate.
- **preview entry** — same, so `/@mechanica/preview/<composedId>` and therefore
  `mechanica shot <composedId>` and `thumbs --blocks` work unchanged.

Definitions are data (small JSON); they always ship whole in the client bundle.

### 4.6 Code splitting

`usedBlockIds` (`src/core/load-blocks.ts`) gains composed expansion: when a
content tree references a composed id, expand through its template (recursively
in principle, one level in v1) so `loadBlocks` fetches the *underlying* compiled
blocks' chunks before mount, and the router's `ensureBlocks` hook keeps working
on SPA navigation. Same expansion in `mechanica export`'s per-page asset
resolution (`src/cli/page-assets.ts`) so exported pages preload/link the chunks
and CSS of blocks used *through* a composed block. Element blocks are in the
runtime chunk — nothing to load.

### 4.7 Schema defaults & versioning

Composed props are ordinary compact-json-schema, so `fillContentDefaults` /
`generatePage` default-baking works once composed schemas are visible where
compiled `blockSchema`s are consumed today (dev `page-state.ts` via
`setPageBlocks`, export via the SSR entry's block list). Composed blocks have
**no `migrate`** — renaming an exposed prop in the composer must offer
"keep data key" or accept that placed instances lose the value (v1: warn in UI).

## 5. Dev server integration

### 5.1 Store: `src/vite/dev/composed-store.ts`

Mirrors `pages-store.ts` patterns (atomic writes through `fs-utils`, own-write
marking so the watcher doesn't echo, optimistic concurrency via content-hash
version, 409 on mismatch):

- `listComposedBlocks(mechDir)` → `[{ id, name, icon }]`
- `readComposedBlock(mechDir, id)` → `{ def, version }`
- `saveComposedBlock(mechDir, id, def, version, force?)` → new version | 409
- `createComposedBlock(mechDir, def)` (id uniqueness checked against compiled
  block ids too — the dev middleware gets the compiled list already)
- `deleteComposedBlock(mechDir, id)`

Endpoints under the existing `/@mechanica` middleware: `GET /composed`,
`GET /composed/get?id=`, `POST /composed/save`, `POST /composed/create`,
`POST /composed/delete`. (Don't reuse `GET /@mechanica/blocks` — that lists
palette blocks for `thumbs`; instead **extend** its output to include composed
ids so `thumbs --blocks` covers them.)

### 5.2 Watching & invalidation

Watcher on `mechDir/blocks/**.block.yml` (add/change/unlink, skipping
own-writes via `wasRecentlyMutated`): invalidate `virtual:mechanica/composed`
and `server.ws.send({ type: 'full-reload' })` — the exact `invalidateBlocks`
precedent for schema changes (the page editor reads block metadata once at
startup; a reload is the only honest refresh). The composer itself saves
through the store (own-write), so it never reloads out from under the designer;
pages open in other tabs reload and pick up the new definition.

### 5.3 Composer route & entry

- `GET /@mechanica/composer/<blockId>` — dev middleware serving an HTML shell,
  modeled 1:1 on `renderPreviewHtml` (`src/vite/dev/preview.ts`): Vite client +
  `/@id/__x00__virtual:mechanica/composer`, request in
  `window.__MECHANICA_COMPOSER__ = { blockId }`. `blockId === '~new'` opens an
  empty definition.
- `virtual:mechanica/composer` (generated in `entries.ts`): imports the user
  entry for side effects (global CSS/fonts — same trick as the preview entry),
  imports `blocksMap` + `composedList`, fetches site-scope data from
  `/@mechanica/state?path=/` (blocks with `useData` render truthfully on
  canvas), then `mountComposerApp({ … })` from `mechanica/composer`.
- Package export `mechanica/composer` → `src/editor/composer/composer.ts`.
  **Dist build:** add the entry to `vite.lib.config.ts`'s browser build (it
  must share chunks with `editor`/`index` — single data-registry/runtime
  instance, per the existing multi-entry rule). dev-app aliases it back to
  source like the other entries.

## 6. The Composer app (editor UI)

Lives in `src/editor/composer/` — it is editor code and reuses `fields/`,
`ui/`, `styles/` tokens, `lib/history.ts`, `lib/shortcuts.ts`,
`lib/save-queue.ts`, drag logic. Everything styled with `--mech-*` tokens so it
reads as another window of the same editor.

### 6.1 Screen layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Hero Banner ✎        [ 390 | 768 | 1440 ]   [– 100% +]   ● Saved   │
├────────────┬───────────────────────────────────────┬─────────────────┤
│ INSERT     │                                       │ INSPECTOR       │
│ Frame Text │      canvas (live renderBlocks,       │ Layout          │
│ Image Btn  │      selected-breakpoint width,       │ Size (hug/fill/ │
│ ────────── │      zoom 25–200%)                    │       fixed)    │
│ composable │                                       │ Style           │
│ code blocks│                                       │ Typography      │
├────────────┤                                       │ Props ⚡        │
│ LAYERS     │                                       │ (or SchemaForm  │
│ (tree)     │                                       │  for code block)│
└────────────┴───────────────────────────────────────┴─────────────────┘
```

Components: `ComposerApp.vue` (shell + top bar), `ComposerCanvas.vue`,
`InsertPalette.vue`, layers tree (generalize `HierarchyTree` or extract a
shared tree component — it is currently bound to the page store; parameterize
it over a tree interface rather than fork), `ComposerInspector.vue` with
sections `LayoutSection` / `SizeSection` / `StyleSection` / `TypographySection`
/ `PropsSection`, and `SchemaForm` (existing) when a `composable` code block is
selected.

### 6.2 Canvas

- Renders the live template through `renderBlocks` with the real BlocksMap —
  the same pixels a page will show. Selection overlay reuses the
  `use-block-frames` approach (`data-block-id` is already stamped by
  `renderBlocks`).
- Root frame semantics per §4.1. Breakpoint switcher (390/768/1440 — the
  `shot --width` trio) narrows the canvas; edits made while a non-desktop
  breakpoint is active write into `$bp.md`/`$bp.sm` overrides for layout keys
  (an "overridden" dot on the control, click to reset).
- Zoom via Ctrl+wheel; click empty space deselects; Esc walks selection up the
  tree; double-click on text enters inline editing (contenteditable v1, plain
  string).
- Drag reorders within a flex parent and re-parents across frames
  (drag-controller patterns); no pixel dragging except `$abs` children, which
  drag freely inside their frame (writing anchor offsets).

### 6.3 Inspector behavior

- **Layout** (frames): direction, gap, 9-point align/justify, wrap, padding.
- **Size**: hug/fill/fixed per axis + px input for fixed; min-height on frames.
- **Style**: background (color / image via upload), radius, border, shadow
  presets. Color inputs offer the site's design tokens first (scan `:root`
  custom properties in dev; free hex allowed) — value stored as `var(--x)` when
  a token is picked. This is the guardrail against inline-style soup.
- **Typography** (text): tag, size, weight, line-height, color, align.
- **Absolute** toggle on any frame child → anchor picker + x/y/z.
- **Props ⚡**: on each bindable control, an "expose as prop" toggle → name +
  title popover; a summary list of all exposed props (rename, re-order, change
  default, un-expose). This drives §2.3.
- **Code blocks**: selected `composable` block shows its normal `SchemaForm`;
  its own props can be bound (`$bind`) where types match — v1: string-ish and
  image fields only.

### 6.4 Persistence & lifecycle

- Debounced save through a `save-queue` instance to `/@mechanica/composed/save`
  with version + 409 conflict surface (same toolbar states as pages: retry /
  keep mine / reload from disk). `beforeunload` beacon flush.
- Undo/redo via `history.ts` over the definition (template + props), standard
  shortcuts from `shortcuts.ts`.
- Top-bar name/icon editing writes definition metadata. "Delete block" only
  from the page-editor palette context menu (with a "used on N pages" warning —
  count via a store scan; placed instances of a deleted id render as nothing,
  which `renderBlocks` already tolerates).

### 6.5 Entry points (page editor changes)

- `BlockPalette`: a "Site blocks" section listing composed blocks (thumbnail
  cards like compiled blocks) + a **New block** card → opens
  `/@mechanica/composer/~new` (same tab; the editor's save queue flushes first,
  exactly like `switchPage`). Context menu on a composed card: Edit / Delete.
- `composable: true` support: add to `BlockDefinition`
  (`src/core/define-block.ts`), `Block` type (shared), passes through
  `compile-block.ts` untouched (it serializes the whole definition; verify) and
  through `toBlockMeta`. Composable blocks appear in the **composer's** insert
  palette; page-palette visibility remains governed by `hidden`.

## 7. Implementation stages

Each stage lands green (`bun run --filter mechanica test` + `typecheck`) and is
independently useful. **Stage 0 has no UI at all** — after it, composed blocks
authored by hand (or by Claude) already render, export, and shoot; the composer
is pure UI on top.

### Stage 0 — foundation (data model, runtime, plugin, store)

1. `shared`: `ComposedBlockDefinition` type; `block-format.ts` codec + subpath
   export (package.json `exports`, tsconfig, vitest alias check);
   `compose.ts` — `resolveComposedTemplate`, id namespacing, `$bind`
   substitution, v1 validation (no nested composed). Tests: codec roundtrip,
   binding resolution, malformed input.
2. `mechanica/src/elements/`: four elements + `style-vars.ts` + `elements.scss`
   + `registerElements`. Tests: node (style-vars pure mapping), dom (render,
   `$bp` var emission, `$abs`).
3. `core/composed.ts` factory + `createMechanica` `composed` option +
   `usedBlockIds`/`loadBlocks` expansion. Tests: dom render of a definition
   with bindings; expansion unit test.
4. Plugin: `virtual:mechanica/composed` (+ `.d.ts` in `virtual-modules.d.ts`),
   entries wiring (client/ssr/preview), watcher + invalidation.
5. Dev store + endpoints + extend `GET /@mechanica/blocks` listing.
6. Export path: composed schemas into default-filling; `page-assets.ts` chunk
   expansion. Verify: dev-app fixture `.mech/blocks/hero-banner.block.yml`,
   place on a page, `bun run export` output correct, `mechanica shot
   hero-banner` and `shot /page` render it.

### Stage 1 — Composer MVP

Route + shell HTML + `virtual:mechanica/composer` entry + `mechanica/composer`
export (incl. `vite.lib.config.ts` entry). ComposerApp: canvas (render,
selection frames, breakpoint widths, zoom), layers tree, insert palette
(elements only), inspector Layout/Size/Style/Typography, inline text edit,
image upload (existing `/@mechanica/upload` + `listImages`), button + smartLink
field, drag reorder/reparent, undo/redo, debounced versioned save.
Acceptance: build a hero visually, place it on a page, shot it at 1440/390.

### Stage 2 — parameterization & palette integration

Props ⚡ exposure end-to-end (schema generation, previewData capture, page-side
SchemaForm just works), `composable: true` flag + code blocks in the insert
palette with SchemaForm + string/image binding, page-editor palette "Site
blocks" section + New/Edit/Delete entry points, `thumbs --blocks` covering
composed ids.

### Stage 3 — responsive & absolute & polish

Breakpoint override editing UX (override dots, reset), `$abs` toggle + canvas
dragging of absolute children, token-first color inputs, "used on N pages"
delete warning, "save selection as composed block" action in the page editor
(serialize the selected subtree — the cheap Figma-"create component" moment).

### Explicitly out of scope (v1)

Free-canvas mode; interactions/states/animations; nested composed blocks;
per-breakpoint arbitrary edits beyond layout keys + visibility; arbitrary CSS;
rich text inside `mech:text` (plain string; inline marks are a v1.5 candidate
via the existing vuewrite inline renderer); prop migrations; eject-to-SFC
codegen (the semantic flex template makes it feasible later — keep it in mind,
don't build it).

## 8. Testing strategy

- **Unit (node):** codec roundtrip + error cases; `resolveComposedTemplate`
  (bindings, `$bp` passthrough, id namespacing, visibility binding);
  `style-vars` mapping; `usedBlockIds` expansion; composed-store CRUD +
  version conflicts (tmp dir, like pages-store tests).
- **DOM:** elements render (flex vars, media vars, `$abs`); composed component
  via `createComposedComponent` inside a mecanica context; PropsSection expose
  flow; canvas selection mapping (`data-block-id`).
- **End-to-end (manual but scripted):** dev-app fixture block; `mechanica shot
  <id> --width 1440,390`; `shot /page`; `bun run export` + inspect emitted
  HTML/links. Read the PNGs — per repo rule, work isn't done until the shot
  looks right.

## 9. Risks & open questions

- **Style soup.** Mitigation is token-first color/typography inputs (§6.3);
  decide in Stage 1 whether free hex is allowed or gated. Where do tokens come
  from — scanning `:root` is heuristic; a `tokens` option on
  `defineMechanicaApp` is the clean future.
- **HierarchyTree generalization** may snowball; if parameterizing it over a
  tree interface gets ugly, fork a minimal `ComposerLayers.vue` instead and
  accept the duplication.
- **Full-reload on composed change** is blunt (open pages reload). Acceptable
  v1 (matches compiled-block schema edits); a targeted bridge update is a
  later refinement.
- **Text element ambition.** Plain string + tag is deliberately poor next to
  the existing richText field. Resist wiring vuewrite into the canvas in v1 —
  it drags widget UIs and markdown codec questions into the composer.
- **Id collisions** between composed and compiled blocks: enforced at
  create/rename (store checks the compiled list) and validated on parse.
- **`compile-block.ts` passthrough** of the `composable` flag needs
  verification — if the compiler whitelists definition keys, add it.
- **Element CSS footprint** always ships (§4.1). Fine now; if it grows, gate
  registration on "site has any composed blocks or element usage".

## 10. Definition of done (whole feature)

A designer opens the palette, creates a new block, assembles
frame/text/image/button with flex controls at three breakpoints, exposes title
and image as props, saves; an editor places it on a page, fills the form, the
page exports statically with correct chunks and responsive CSS;
`mechanica shot` of both the block and the page look correct at 1440 and 390;
the `.block.yml` is readable in a PR diff, and a developer (or Claude) can
author the same file by hand with no editor involved.
