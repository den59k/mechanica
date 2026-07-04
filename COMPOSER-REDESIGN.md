# COMPOSER-REDESIGN: Block Composer v2 — Figma-grade UX

Status: **implemented (R1–R5), verified.** This document was the implementation
spec for the Composer redesign; the code now matches it. Read [PLAN.md](./PLAN.md)
first (v1 design + foundations) and [CLAUDE.md](./CLAUDE.md) (architecture,
conventions, verification rules). Everything in PLAN.md that this document does
not explicitly change **stays as built**.

**Done:** R1 root-frame invariant (`lib/normalize-template.ts`, store
protections, Esc-walks-up, Row/Column presets, `maxWidth`). R2 components
manifest (`defineComposerComponents` → `src/composer.ts` → `virtual:mechanica/components`,
registered into every entry; `composable` + `mech:button` removed; userland
`UiButton`; bindable `ComponentFields`). R3 top-toolbar insert + Components
popover + R/C/T/I keys, layers-only left panel, Figma inspector (`NumInput`/
`SizeInput`/`AlignGrid`/icon `SegControl`, `lib/padding.ts`, per-side padding,
compact Variables). R4 on-canvas overlay (`lib/canvas-overlay.ts` +
`CanvasOverlay.vue`: hover, selection frame, 8 resize handles, size badge, frame
label; resize; move-relocate via the shared `lib/canvas-drop-target.ts`; `$abs`
free drag; `store.measured` → `SizeInput`; `history.commit()` on drag end). R5
inline text editing (double-click) + Components popover search. **Deferred
polish** (optional, non-blocking): padding drag-strips on canvas, gap drag,
NumInput label-scrub, block-icon picker popover, lazy components chunk +
per-page preload (components register eagerly today).

## 1. Why — critique of the current composer

The v1 composer works end-to-end (build → save → place on page → export →
shot), but it reads as a *settings form bolted onto a canvas*, not a design
tool. Concretely (verified against the live UI at
`/@mechanica/composer/hero-banner`):

1. **The inspector is words, not controls.** Every property is a full-width
   `label — segmented control` row with text labels: Direction is
   `Vertical | Horizontal`, Align is `Start | Center | End | Stretch`, Weight is
   `Regular | Medium | Semi | Bold`. Figma expresses the same choices with
   icon toggles and a 3×3 alignment grid in a fraction of the space, and the
   icons *are* the explanation. There are no W/H number fields — size is a
   `Hug | Fill | Fixed` segment with a px input that appears only in Fixed
   mode, so you can't see how big anything actually is.
2. **"Block settings" (nothing selected) is three text inputs and a rough
   Variables list.** Each variable takes two full rows (head + default-value
   input); the panel is dominated by hint text. It looks unfinished and is the
   first thing a user sees.
3. **The canvas is render-only.** Selection is a 2px CSS outline
   (`SelectionStyle` in `ComposerCanvas.vue`) — no hover highlight, no size
   badge, no resize handles, no padding/gap visualization, and no way to move
   an existing element by dragging it on canvas (only the layers tree
   reorders, and only palette cards drag-to-insert). Every spatial edit goes
   through number inputs on the right.
4. **Weak semantics.** The only container is "Frame" with a direction toggle
   buried in the inspector; and the *block itself* is not an entity — the
   template is a bare node list, so the root has no layout of its own and
   "Block settings" is disconnected from the thing on canvas.
5. **`mech:button` is a foreign design system.** Its hard-coded
   primary/secondary/ghost styling never matches the site. What sites actually
   want in the composer is *their own* Button/Badge/Card. Today the opt-in is
   `composable: true` (+ `hidden: true` so it doesn't pollute the page
   palette) scattered across `defineBlock` calls — a page-block mechanism
   abused for something that isn't a page block.

## 2. Design principles

- **Figma-like, but calm.** Direct manipulation first, inspector second. Icon
  controls, compact rows, 3×3 alignment grid. Keep the existing editor design
  language: `--mech-*` tokens, light theme, blue (#3b82f6) selection, black
  reserved for primary actions. No dark theme.
- **The data model does not change shape.** Composed blocks remain
  parameterized `ContentBlock` trees rendered by `renderBlocks`; `$bp` /
  `$abs` / `$bind`, the YAML codec, save/version pipeline, breakpoint
  pre-merge canvas strategy, and the insert-DnD plumbing all stay. This is a
  UX + integration redesign, not a rewrite.
- **Components come from the developer.** The composer's palette of "real"
  components is the site's own design system, declared once in a manifest —
  not generic built-ins, not per-file flags.
- **Everything verifiable headlessly.** Each stage ends with
  `mechanica shot <id>` / `shot /page` **and** a CDP screenshot of the
  composer UI itself (see §10) — Read the PNGs.

## 3. The changes at a glance

| # | Change | Replaces |
|---|--------|----------|
| A | Canonical **root frame** — the block *is* a frame with layout | bare `template: ContentBlock[]` with no root entity |
| B | **Row / Column** insert items + direction-derived labels | single "Frame" card, direction picked in the inspector |
| C | **Components manifest** (`defineComposerComponents`, one file) | `composable: true` (+ `hidden: true`) in `defineBlock` |
| D | **`mech:button` removed**; the site ships its own Button as a component | built-in generic button element |
| E | **On-canvas manipulation**: resize, padding, move, size badge, hover | inspector-only spatial editing |
| F | **Inspector + Block settings redesign**, Figma-style | label/segment form rows |
| G | **Top toolbar** for inserting; left panel becomes layers-only | Insert grid stacked above Layers |

## 4. Spec A — the root frame

**Invariant:** in the composer, `def.template` is exactly one `mech:frame`
node — the root. The block *is* that frame.

- `composer-store.ts` gains `normalizeTemplate(def)` applied in
  `createComposerStore` and `replace()`: a template that is already a single
  frame passes through; anything else (legacy multi-root, non-frame root,
  empty) is wrapped in / replaced by a root column frame. New blocks start as
  `{ direction: 'column', gap: 24, padding: [64, 24] }`. Pure helper in
  `lib/` + unit tests. The runtime (`resolveComposedTemplate`,
  `createComposedComponent`) keeps tolerating arbitrary templates — only the
  editor normalizes; hand-authored files still render.
- **Canvas:** the root frame is the canvas surface. Above it, a small
  Figma-style frame label with the block name (`.mech-composer__frame-label`);
  clicking the label or the frame's own background selects the root. Clicking
  the dot-grid outside deselects. `Esc` walks selection up: child → parent →
  root → none (today it deselects in one hop — change it).
- **Root protections:** `remove()` and drag-relocate are no-ops for the root;
  `insertNode` with no selection appends into the root (not `template`);
  duplicate on root is a no-op. The layers tree shows the root as the top
  node labelled with the block name.
- **Root inspector:** the normal frame inspector (§8) with a "Root" badge in
  the header. This is where "the block's layout" lives — the direct answer to
  "set a layout for the root block".
- **New frame prop `maxWidth`** (any frame, most useful on the root's inner
  column): add to `FRAME_VARS` in `src/elements/style-vars.ts`
  (`--el-maxw`, `to: px`) + `max-width: var(--el-maxw, none)` and
  `margin-inline: auto` when set, in `elements.scss`. This enables the
  standard section pattern — full-bleed root background, centered content
  column — without a second box model. Document the pattern in the inspector
  (a "Content width" field on frames).
- Migrate `dev-app/.mech/blocks/*.block.yml` fixtures to single-root form
  (hero-banner already is). **This migration is explicitly authorized** —
  the "leave `.mech/` alone" rule is waived for the files this redesign
  changes.

## 5. Spec B — Row and Column

Keep **one** underlying element (`mech:frame`) — do *not* introduce
`mech:row` / `mech:col` block ids. Two ids for one concept would fork the
`$bp` story (a Row that stacks on mobile is the whole point of direction
overrides) and double the element/style-vars surface. Semantics live in the
editor instead:

- **Insert items:** `Row` (icon: horizontal bars) and `Column` (vertical
  bars) replace the single `Frame` card in `lib/elements-meta.ts`. Both
  create a `mech:frame`; Row presets `{ direction: 'row', gap: 16 }`, Column
  `{ direction: 'column', gap: 16 }`. Nested frames default to `padding: 0`
  (the current `padding: 24` default makes nesting feel spongy); only the
  root default keeps padding.
- **Labels:** `frameLabel(node)` in `elements-meta.ts` — a frame whose *base*
  direction is `row` reads "Row", else "Column"; used by the layers tree and
  the inspector header. `blockLabel` delegates to it. Changing direction in
  the inspector (still possible, as an icon toggle) just changes the label.
- **On-disk YAML is unchanged** (`blockId: mech:frame` + `direction`), so
  hand-authored and existing files need no migration.
- Keyboard: with the canvas focused, `R` / `C` / `T` / `I` arm insertion of
  Row / Column / Text / Image at the current selection (same path as a
  palette click).

## 6. Spec C — the components manifest (replaces `composable`)

**The idea:** composer building material = the site's design system,
declared once. A single manifest module, default `src/composer.ts`
(plugin option `composerFile`), collected into
`virtual:mechanica/components`:

```ts
// dev-app/src/composer.ts
import { defineComposerComponents } from 'mechanica'
import UiButton from './components/UiButton.vue'
import Badge from './components/Badge.vue'

export default defineComposerComponents({
  button: {
    component: UiButton,
    name: 'Button',
    icon: 'button',
    props: {
      label: { type: 'string', default: 'Button' },
      link: { type: 'string', format: 'smartLink' },
      variant: { type: 'string', enum: ['primary', 'secondary', 'ghost'], default: 'primary' },
    },
    previewData: { label: 'Get started' },
  },
  badge: { component: Badge, name: 'Badge', icon: 'star', props: { /* … */ } },
  card: 'card', // ← a string exposes an existing page block by id
})
```

Key decisions:

- **Components are plain Vue SFCs** (ordinary `defineProps`) — **no
  `defineBlock`**, no block compiler involvement, so any component works,
  including ones the site already has. The editable schema lives *in the
  manifest* (compact-json-schema, same field registry). `renderBlocks`
  already passes node `data` as props/attrs, so nothing changes at render
  time. A string entry (`card: 'card'`) re-exposes an existing compiled page
  block — for the "a hero can contain the Card block" case — resolved
  against the blocks list at collect time.
- **`defineComposerComponents` is an identity function with types**, exported
  from the `mechanica` barrel (pattern: `defineWidget`). Shared type
  `ComposerComponentDefinition` lives in `mechanica-shared` (DOM-free — the
  `component` field is typed as `unknown` there; `mechanica` narrows it).
- **Ids share the block-id namespace.** Collide with a compiled block or a
  composed block id → hard error at collect time (and `composed-store`'s
  create-time uniqueness check extends to component ids).
- **Registration:** all four generated entries (`src/vite/entries.ts`) import
  the manifest and register each `component` into the BlocksMap next to
  `registerElements` — dev, SSR, client, preview. Composed blocks that
  expand to a component therefore render everywhere, and
  `mechanica shot <composed-id>` keeps working with zero extra wiring.
- **Client code splitting:** the manifest is one user module, so it becomes
  **one lazy chunk** (mirroring `blockChunks: 'bundled'`): the generated
  client entry maps every component id to
  `() => import('virtual:mechanica/components')` in the `blockLoaders` map;
  `loadBlocks` / `ensureBlocks` need no changes (`usedBlockIds` already
  expands composed templates to underlying ids). Extend the
  `dist/mechanica-blocks.json` emission so component ids map to the manifest
  chunk file — `page-assets.ts` then preloads/links it per page like any
  block chunk.
- **Editor:** the composer entry passes the manifest list into
  `mountComposerApp` (new `components` option) instead of deriving
  `codeBlocks` from `toBlockMeta(…).composable`. The insert palette's
  "Components" section and the inspector's SchemaForm path
  (`ComposerInspector`'s `codeBlock` branch) consume it — same `Block`-shaped
  metadata (`{ id, name, icon, props }`), so those code paths barely change.
- **Dev watching:** the manifest is a real module imported by the entries —
  Vite's module graph invalidates it naturally; no new watcher. (Schema-only
  edits behave like block schema edits: full reload, the honest refresh.)
- **Removal:** delete `composable` from `BlockDefinition`
  (`src/core/define-block.ts`), the shared `Block` type, `toBlockMeta`
  (`src/editor/lib/block-meta.ts:35`), and `composer.ts`'s filter. Migrate
  dev-app's `Badge.vue` out of `src/blocks/` into `src/components/` (drop
  `defineBlock`, plain `defineProps`) + manifest entry — it currently
  documents the old pattern in its comments; rewrite them for the new one.

### 6.1 `mech:button` moves to userland

- Remove the Button element: `src/elements/index.ts` (component +
  `elements` map entry), its styles in `elements.scss`, its palette card and
  `ElementMeta` in `elements-meta.ts`, and the Button inspector section.
  Elements left: `mech:frame`, `mech:text`, `mech:image` — pure layout/content
  primitives with no opinions about visual identity.
- dev-app gets `src/components/UiButton.vue` (props: `label`, `link`
  (smartLink, rendered via the runtime `Link` helper — import it from
  `mechanica` so editor link-following/SPA routing keep working), `variant`)
  and the manifest above. Port the current `mxel-button` styles as its
  starting look so shots stay comparable.
- Migrate `dev-app/.mech/blocks/hero-banner.block.yml`: the `cta` node's
  `blockId: mech:button` → `button`; `label`/`link` binds stay as-is if
  UiButton keeps those prop names (it should — minimal YAML diff).
- `create-mechanica`'s template: add the same `UiButton` + a one-entry
  `src/composer.ts` so scaffolded sites demonstrate the pattern (template
  deps pin published versions — only relevant at next release).
- No back-compat shim: v2 is unreleased and dev-app is the only consumer. An
  unknown `mech:button` in a stray file renders as nothing
  (`renderBlocks` tolerates unknown ids) — acceptable.

## 7. Spec G — screen layout (do this before F; it reframes the panels)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Hero Banner ✎   [▭ Row][▯ Column][T Text][▨ Image][⬡ Components ▾]     │
│                               [1440|768|390]        ↶ ↷        ● Saved  │
├──────────────┬─────────────────────────────────────────┬─────────────────┤
│ LAYERS       │              ┌ Hero Banner ┐            │ INSPECTOR       │
│ ▾ Hero Banner│              │  (root frame │            │ (§8)           │
│   T Eyebrow  │              │   = canvas)  │            │                 │
│   T Title    │              └─────────────┘            │                 │
│   T Subtitle │                 dot-grid viewport        │                 │
│   ◉ Button   │                 (pan/zoom, zoombar)      │                 │
└──────────────┴─────────────────────────────────────────┴─────────────────┘
```

- **Insert moves to the top bar** as icon buttons (Row, Column, Text, Image)
  plus a **Components** popover (searchable list from the manifest). Palette
  cards keep both interactions: click appends at selection, pointerdown+drag
  runs the existing insert-DnD (`use-insert-dnd` is pointer-based and doesn't
  care where the card lives). The left panel becomes **layers only**, full
  height — the tree is the panel users actually live in.
- The right panel stays always-visible: element inspector when something is
  selected, Block settings otherwise (§8.3).
- Everything else in the shell (breakpoint trio, undo/redo, save status,
  back) stays.

## 8. Spec F — inspector redesign

Replace the label/segment rows with compact Figma-style sections. New
primitives in `composer/components/` (all styled with `--mech-*` tokens,
pure logic in `lib/` where it exists):

- **`NumInput`** — compact number field with an embedded label/icon prefix
  (`[⭤ 16]`), select-on-focus, arrow-key step (Shift = ×10). Drag-to-scrub on
  the prefix is a stretch goal (§11).
- **`SizeInput`** — a NumInput + unit dropdown per axis:
  `W [320 ▾Fixed]`, `H [— ▾Hug]`. The number shows the **measured** px even
  in Hug/Fill (read from the canvas overlay, §9 — grey/italic when not
  Fixed); typing a number switches the axis to Fixed.
- **`AlignGrid`** — the 3×3 alignment matrix for frames: sets `align` +
  `justify` in one click; `justify: between` is offered as a
  Figma-like "spacing: auto" toggle next to the gap field.
- **`SegControl` grows icon support** (`{ value, icon, title }` options) —
  direction ⇄/⇅, text align, wrap. Icons are new `*.svg` files in
  `src/editor/icons/` (Figma exports, `?svg-glob` handles normalization);
  needed set: direction-row, direction-column, wrap, text-align-left/center/
  right, size-hug, size-fill, size-fixed, padding, gap, corner-radius,
  component (⬡).

### 8.1 Sections (frame selected)

```
▤ Row                              ✕
─────────────────────────────────────
Size      W [ 320 ▾Fixed]  H [ — ▾Hug]
          Content width [ — ]            ← maxWidth, frames only
─────────────────────────────────────
Layout    [⇅][⇄]  [↩ wrap]
          ┌ · · · ┐   gap  [⭤ 16]
          │ · • · │   pad  [⭥ 96][⭤ 24]  [⛶]
          └ · · · ┘
─────────────────────────────────────
Position  [In flow][Absolute]            ← unchanged behavior; X/Y/anchor when absolute
─────────────────────────────────────
Fill      [■ #f6f6f4]  Radius [◜ 12]     ← ColorField stays token-first
```

- `[⛶]` expands padding to four per-side inputs. Padding math lives in a new
  pure `lib/padding.ts`: parse `number | [y,x] | [t,r,b,l]` → `{t,r,b,l}`,
  and collapse back to the shortest form on write (unit-tested;
  `style-vars.ts`'s `padding()` already renders all three forms).
- Text selected: Content (textarea + tag segs, BindField ⚡ unchanged),
  Size, Typography (size/weight/align as icon segs + ColorField), Position.
- Image selected: preview + Upload/URL/alt (BindField), fit, radius, Size,
  Position.
- Component selected: header shows its name/icon; body is its `SchemaForm`
  (existing path) — plus Size and Position sections, which apply to any node.
- `OverrideLabel` (the ↺ reset on breakpoint overrides) and the
  "Editing tablet/mobile overrides" note carry over to the new rows — don't
  lose them.

### 8.2 Header

`[kind icon] Row · #f6f6f4 chip? ✕` — keep it one line: element icon +
derived label (frameLabel / "Text" / "Image" / component name), close button.
The root adds a `Root` badge.

### 8.3 Block settings (nothing selected) — redesigned

```
⬡  Hero Banner                      ← icon button (opens icon picker popover)
   [Hero Banner            ]  name
   [Site blocks          ▾ ]  category (datalist of existing categories)
─────────────────────────────────────
VARIABLES                        [+?]
⚡ eyebrow    string   [New        ] ⋯
⚡ title      string   [Build fast…] ⋯
⚡ ctaLabel   string   [Get started] ⋯
─────────────────────────────────────
Root layout →                        ← one-click "select root" affordance
```

- One row per variable: bolt, name (click-to-rename inline), type chip,
  default value input, and a `⋯` menu (Remove; later: change type). Halves
  the vertical footprint and drops the paragraph hints (a single quiet
  empty-state line remains).
- Icon becomes a picker popover over the built-in VIcon set instead of a raw
  text input.
- No `[+]` add-variable button in v1 — variables are still born from the ⚡
  on fields (that flow is good); the header shows a hint tooltip instead.

## 9. Spec E — on-canvas direct manipulation

The centerpiece. Replace the `SelectionStyle` style-tag hack with a real
overlay layer in `ComposerCanvas.vue`:

- **`components/CanvasOverlay.vue`** — absolutely-positioned chrome in
  *viewport* space (sibling of `.mech-composer__world`, like the zoombar):
  hover outline (1px blue), selection frame (2px blue), 8 resize handles,
  size badge under the selection (`320 × Hug`), padding strips (frames),
  and the block-name frame label (§4). It renders from measured rects.
- **`lib/canvas-overlay.ts`** — pure geometry, unit-tested: world↔viewport
  rect mapping (`(rect, view) → screen rect` given zoom/pan), handle layout
  (8 positions from a rect), hit zones, resize math
  (`(startRect, handle, dx, dy, zoom) → { w?, h? }` with rounding and an
  8px min), padding-drag math (`(side, delta, zoom, padding) → padding'`).
- **Measurement:** selected + hovered element rects via
  `getBoundingClientRect` (already screen-space under the world transform —
  same trick `use-insert-dnd` relies on). Re-measure on: store `def` deep
  watch (post-`nextTick`), view changes (zoom/pan), a `ResizeObserver` on
  the selected element, and every frame during an active drag (rAF loop only
  while a pointer interaction is live — no permanent loop).
- The measured selected-node size is published on the store
  (`measured: { w, h } | null`, view state like `zoom` — not persisted, not
  undone) so `SizeInput` can display real dimensions (§8).

Interactions (all writing through existing store ops, so undo/save/bridge
come free; the 350ms trailing debounce in `composer-history.ts` coalesces a
drag into one undo entry — call `history.commit()` on pointerup so a slow
drag can't split):

1. **Resize** — drag an edge/corner handle → `setData(id, { w|h: px }, { responsive: true })`
   (drag deltas ÷ `store.zoom`, rounded). The axis becomes Fixed, matching
   Figma. Double-click a handle resets that axis to Hug
   (`setData(id, { w: undefined })`).
2. **Padding** — with a frame selected, four slim strips inside its edges
   (visible on selection, blue-tinted while dragging). Dragging a strip
   adjusts that side via `lib/padding.ts`; **Alt+drag sets all sides**
   (Figma parity). Writes responsive.
3. **Move** — pointerdown on a selected element (or select-then-drag in one
   gesture) past a 4px threshold starts a relocate drag: reuse
   `computeInsertion` + the existing drop indicator/ghost from
   `use-insert-dnd` (extract the shared hit-test/indicator core so insert and
   relocate don't fork), ending in `store.relocate(id, drop)`. The root
   never relocates. `$abs` children instead drag freely inside their parent
   frame, writing `$abs.x/y` (÷ zoom) — this closes PLAN.md's deferred
   "canvas drag of absolute children".
4. **Gap (stretch, §11)** — a grab zone between two children of the selected
   frame; drag adjusts `gap`.
5. **Hover** — moving the pointer over the canvas outlines the would-be
   selection target and shows its label in a small tag; click behavior is
   unchanged (deepest `data-block-id`, links intercepted in capture phase).

Interaction arbitration: handle/strip hits are tested before canvas click
selection (the overlay owns pointerdown on its chrome; the canvas keeps
click-select). Middle-mouse pan, wheel zoom/pan, and insert-DnD are
untouched.

## 10. What deliberately does not change

`ComposedBlockDefinition` + YAML codec; `$bp`/`$abs`/`$bind`; the pre-merge
breakpoint canvas (no viewport media queries in the editor); `renderBlocks`
expansion + `createComposedComponent`; save queue/versioning/409 handling;
`composed-store.ts` endpoints; pan/zoom view math (`canvas-view.ts`);
`BindField`/⚡ prop exposure and `PropsSection` semantics (only restyled);
page-editor palette integration ("Site blocks", New/Edit/Delete,
`saveAsBlock`); `mechanica shot`/`thumbs` coverage.

## 11. Implementation stages

Each stage lands green — `bun run --filter mechanica test` +
`bun run --filter mechanica typecheck` — with new coverage, and is verified
visually: `mechanica shot hero-banner --width 1440,390`, `shot
/composed-demo`, plus a headless screenshot of the composer UI itself (CDP
script pattern: navigate to `/@mechanica/composer/hero-banner`, wait for
`.mech-composer__canvas [data-block-id]`, `Page.captureScreenshot`; reuse
`src/cli/headless.ts` helpers). **Read the PNGs.** Remember: Node-side
plugin/CLI changes need `bun run build` to show up in a *running* dev server
— restart `bunx --bun vite` instead during development.

- **R1 — structure.** Root-frame invariant (`normalizeTemplate` + store
  protections + Esc-walks-up), Row/Column palette presets +
  `frameLabel`, nested-frame `padding: 0` default, `maxWidth` frame var,
  fixture migration. Small, self-contained, unblocks everything visual.
- **R2 — components manifest.** Shared type; `defineComposerComponents`;
  `virtual:mechanica/components` collection + entries registration + client
  lazy chunk + `mechanica-blocks.json`/`page-assets` extension; composer
  `components` option; id-collision validation; **remove `composable`**;
  remove `mech:button`; dev-app `UiButton` + `Badge` migration +
  `hero-banner.block.yml` migration; create-mechanica template entry.
  Acceptance: hero exports + shots correctly with the userland button;
  a page using a composed block that uses `button` preloads the components
  chunk.
- **R3 — shell + inspector.** Top-toolbar insert (icons + Components
  popover + R/C/T/I keys), layers-only left panel; new primitives
  (`NumInput`, `SizeInput`, `AlignGrid`, icon SegControl, icons batch,
  `lib/padding.ts`); rebuilt inspector sections incl. per-side padding;
  Block-settings/Variables redesign. Acceptance: composer screenshots of all
  three states (nothing / frame / text selected) look like §7–8.
- **R4 — canvas manipulation.** `lib/canvas-overlay.ts` +
  `CanvasOverlay.vue` (hover, selection frame, handles, size badge, frame
  label); resize; padding strips; move-relocate (shared core with
  insert-DnD); `$abs` free drag; `measured` on the store feeding `SizeInput`;
  `history.commit()` on drag end.
- **R5 — polish (each item optional, independently shippable).** Gap drag;
  label scrubbing on NumInput; inline text editing on double-click
  (plain-string contenteditable — vuewrite stays out, per PLAN.md);
  Components popover search; icon-picker popover if it slipped R3.

## 12. Testing

- **Unit (node):** `normalizeTemplate` (wraps, passes through, empty);
  `frameLabel`; `padding.ts` parse/collapse round-trips; overlay math
  (rect mapping at zoom≠1, resize clamp/rounding, padding drag, handle hit
  zones); manifest collection (id collisions, string-reference resolution);
  loaders-map merge + `usedBlockIds` through a component;
  `page-assets` mapping for the components chunk.
- **DOM:** AlignGrid (click → align+justify), SizeInput (mode switch, typing
  → Fixed), per-side padding editor, CanvasOverlay renders handles/badge from
  a mocked rect, a manifest component renders through
  `createComposedComponent`, Block-settings variables row (rename/remove).
- **Headless e2e (scripted, per stage):** the CDP screenshot flow above;
  after R4, drive a resize via `Input.dispatchMouseEvent` and assert the
  node's `w` changed in the saved YAML.

## 13. Risks & open questions

- **Overlay drift.** Measured chrome can lag the canvas during animations/
  image loads. Mitigations: re-measure on ResizeObserver + store flush;
  chrome hides during pan/zoom gestures (Figma does the same) if it
  jitters.
- **History granularity.** The 350ms debounce plus `commit()` on pointerup
  should make drags atomic — verify with a slow drag; if entries still
  split, add explicit `history.pause()/resume()` bracketing.
- **Manifest ergonomics.** Schema-in-manifest means a component's editable
  surface can drift from its actual props. Acceptable v1 (they're two lines
  apart in one repo); a typegen/lint is a later idea. Revisit only if it
  bites.
- **Removing `mech:button` from create-mechanica** bumps the template's
  authored content — coordinate with the next `mechanica` release (template
  pins published versions).
- **`justify: between` in AlignGrid** doesn't fit a 3×3 grid cell — the
  "spacing: auto" toggle (§8) is the Figma answer; confirm it reads clearly
  in the R3 screenshot.
- **Should `Text` content editing move fully on-canvas** (R5 inline edit)
  and the inspector textarea shrink to one row? Decide after R5 lands.
