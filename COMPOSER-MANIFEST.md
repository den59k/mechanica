# The Composer Manifest — `defineComposer`: site classes & breakpoints

Status: **implemented** (2026-07-05). Follows [PLAN.md](./PLAN.md) (composed-block
foundations) and [COMPOSER-REDESIGN.md](./COMPOSER-REDESIGN.md) (the Figma-grade UX).
This phase connects the Composer to the site's *development* — its CSS design system.

**Implementation notes / deviations from the plan below:**
- The `@property` registrations stay in `elements.scss` (they don't depend on the
  breakpoint widths); only the var-consuming property rules moved to the generated
  `emit-css.ts`. The `$el-props` list therefore still lives in SCSS — a drift test
  (`emit-css.test.ts`) asserts every `style-vars.ts` `cssVar` appears in the emitter's
  binding table, so the two can't silently diverge.
- Typography yield floors (`fs/fw/lh/color/text-align`) are still emitted (layered)
  reading `var(--el-x, <ua-default>)` rather than omitted — behavior-equivalent, and it
  keeps one uniform emitter path. The `@layer` + knob-rung ladder makes classes win over
  the floor and a set knob win over the class exactly as specced.
- `normalizeClassManifest` is imported into the generated `virtual:mechanica/components`
  module from **`mechanica`** (which re-exports it), not `mechanica-shared`: a virtual
  module can't resolve a bare `mechanica-shared` specifier in the source-aliased dev app,
  but `mechanica` is aliased. In a published consumer both resolve, so this is dev-only
  robustness.
- The Vite **plugin resolves from `dist/`** (Vite's config loader uses the `import`
  condition, not `bun`), so plugin / entries / `collect-components` / `emit-css` /
  `read-breakpoints` changes need **`bun run build` + a dev-server restart** to take
  effect — only the browser entries are source-aliased. (Same constraint as the rest of
  the Node side.)

## 1. Motivation

Today a designer sets a container's max-width or a heading's size as raw numbers per
element. Two composed blocks drift apart; a composed hero and a hand-coded block never
share a type scale. Meanwhile the developer already *has* the design system — CSS classes
like `.container`, `.h1`, `.lead` used throughout coded blocks. The missing link is a way
for the Composer to speak those names.

**Named styles = real CSS classes the developer already owns.** The developer writes the
class once in the site's stylesheet; `defineComposer` *declares the name* so the Composer
can offer it; a composed block stores `cls: container` — one word of data. Change the CSS
and every usage, coded and composed, updates together. No token store, no duplication, no
export-pipeline changes — the composer entry, dev pages, SSR, static export and the
preview/`shot` route all already load the site's global CSS
(`generateComposerEntry` imports the user's app module for side effects), so a class
renders identically everywhere for free.

The feature's motto, and the line that keeps both sides minimal:

> **Classes are the systematic** — design-system vocabulary, lives in CSS, responsive via
> the developer's own media queries. **Knobs are the local** — one-off deviations on this
> element, live in block data.

The same manifest also becomes the home for the site's **breakpoints**: the `md`/`sm`
widths the element system and the Composer's device switcher use, so a site whose grid
flips at 900px isn't stuck with our 1024px default.

## 2. Developer surface: `defineComposer`

`defineComposerComponents` is renamed and widened into a full manifest (v2 is not on npm
yet — dev-app and the create-mechanica template are the only callers, both migrate; the
old export is removed, not aliased):

```ts
// src/composer.ts  (plugin option `composerFile`, unchanged)
import { defineComposer } from 'mechanica'

export default defineComposer({
  // exactly today's defineComposerComponents body
  components: {
    button: { component: UiButton, name: 'Button', icon: 'button', props: { … } },
    card: 'card',
  },

  // the site's design-system classes, offered to elements in the composer
  classes: {
    container: { title: 'Container', on: 'frame' },
    h1:        { title: 'Heading 1', on: 'text' },
    lead:      'text',            // string shorthand: kind only, title = class name
    rounded:   ['frame', 'image'],// array shorthand: kinds only
    // typed groups: same group = mutually exclusive (one select), stack across groups
    panel:     { title: 'Panel', on: 'frame', group: 'surface' },
    'panel-muted': { title: 'Muted', on: 'frame', group: 'surface' },
  },

  // element-system breakpoints (max-widths, px). Literal numbers only — see §6.
  breakpoints: { md: 1024, sm: 640 },
})
```

- A class entry's **key is the CSS class name** — no indirection, greppable in both the
  site's SCSS and `.block.yml` files.
- `on` filters which element kinds offer the class (`'frame' | 'text' | 'image'`, or an
  array). It's the only required metadata; `title` defaults to the key.
- `group` (full form only) makes classes **mutually exclusive within the group** — one
  Style select per group, single-pick; classes in different groups stack on the element.
  Ungrouped classes share one implicit default group labelled "Style". See §3.
- All three sections are optional. A site with only `components` behaves exactly as today.
- Types live in `mechanica-shared` (`ComposerManifest`, `ComposerClassDefinition`,
  DOM-free); `defineComposer` in `mechanica` narrows `component` to a Vue `Component`
  (identity function, the `defineWidget` pattern).
- `collect-components.ts` keeps generating `virtual:mechanica/components`, now from
  `manifest.components`, and additionally exports **`classDefs`** — the normalized list
  `{ cls, title, kinds, group? }[]` (shorthands unfolded) — consumed only by the composer
  entry. `registerComponents` is unchanged.

The split also gives future manifest sections an obvious home (color tokens for
`ColorField`, font lists) without new files or options.

## 3. Designer surface: a **Style** select per group

A `VSelect` **per group** in a section near the top of the element's core (above Content /
Size), shown *only when the manifest declares classes for that kind*. Sites without classes
see zero new UI. Ungrouped classes form one select labelled **Style** (the default group,
first); each named `group` adds its own single-pick select labelled by the humanized key
("Surface", "Elevation", …). So a designer picks a *role per axis* — never composes a raw
class list — and the axes stack: a frame can be Container **and** Panel at once, while Panel
vs Muted stay exclusive. Precedence stays clear because the developer guarantees groups are
orthogonal (each group's classes touch different properties). This is the Figma model
(separate fill / text / effect styles), not Webflow's flat combo list.

- **Single-pick within a group** — like Figma's style categories. The `cls` data key is a
  space-separated string holding at most one class per group; the element renderer already
  renders every token, so stacking needs no data-model change.
- **Base-only**, like `tag` / `content` / `src` — a class is responsive *inside its own
  CSS*, so it must not fork per breakpoint. In breakpoint mode the row writes base.
- A stale value (class no longer in the manifest) still shows — marked `x (missing)` — in
  the default "Style" select; picking None removes it. Other groups' picks are preserved
  when you change one group.
- Placed **components / composed blocks** get no Style row — an SFC styles itself; their
  optional props stay Margin + Position only.
- The canvas is instantly WYSIWYG: the composer page already loads the site CSS, so picking
  "Heading 1" shows the real `h1` style, and the measured size badge / SizeInput reflect it.

Data model: `cls?: string` (space-separated) on element data, persisted in the `.block.yml`
template like any other key. Pure grouping/replace logic lives in
`editor/composer/lib/class-groups.ts` (`classGroupsFor` / `selectedClass` / `setGroupClass`,
unit-tested). Elements append the sanitized tokens to their class list
(`classAttr('mxel mxel-frame', data.cls)`). Rendering needs nothing else — dev, SSR, export,
shot all just work.

## 4. The cascade: class vs knob

The correct semantics: **a class beats the element defaults; a set knob beats the class**
(local deviation wins, like inline style). Today that would break both ways — element
floor rules like `max-width: var(--el-maxw, none)` fight a site's `.container` on source
order, and the `none` / `revert` fallbacks nuke the class when they win. The fix is a
three-rung ladder, generated per property (§5):

1. **Floor** — the var-consuming default rules move into **`@layer mechanica`**. Unlayered
   author CSS beats any layered rule, so the site's plain `.container` / `.h1` now wins
   whenever the knob is unset. (Strictly a fix: "unset knobs keep site styles" becomes
   fully true — today a site rule of equal specificity loses to the floor by import order.)
2. **Class** — the developer's ordinary site CSS, untouched.
3. **Knob** — an unlayered bumped twin per prop, matching *only when that knob is actually
   set at that breakpoint*, so it outranks a single-class site rule exactly then. Same
   `[style*=…]` trick the `--el-maxw` centering rule already uses; the trailing colon
   disambiguates base from `-md`/`-sm`:

```css
/* base rung — applies at every width when the base knob is set */
.mxel-text[style*='--el-fs:'] { font-size: var(--el-fs); }

@media (max-width: 1024px) {
  .mxel-text[style*='--el-fs-md:'] { font-size: var(--el-fs-md); }
}
@media (max-width: 640px) {
  .mxel-text[style*='--el-fs-sm:'] { font-size: var(--el-fs-sm); }
}
```

Rung order (base → md → sm) reproduces the sm ← md ← base override cascade; a knob set
only for `md` leaves the class in charge at desktop — exactly the intended semantics, with
no `revert` landmines. Rungs are (0,2,0) specificity: they beat single-class site rules.
Convention to document: **keep design-system classes single-class selectors** (a
`.hero .h1` site rule would out-specify a knob).

### Which props yield to classes

Not every floor should yield. The flex *structure* is the composer's own model — a class
silently reaching into `align-items` would fight the AlignGrid/SizeInput with no
indication in the inspector. The split:

| | props | floor |
|---|---|---|
| **Yield** (layered floor + knob rungs) | `text-align fs fw lh color` · `bg radius shadow` · `pad margin gap` · `minw maxw minh maxh` · `fit ratio` | class styles apply; a set knob overrides |
| **Hard** (unlayered, as today) | `w h grow self` · `dir align justify wrap` | knob-or-default; classes can't touch them |

Props with **no floor at all** (font-family, letter-spacing, text-transform, borders,
transitions, …) simply work through classes already — zero configuration, and a good
reason classes beat adding more knobs.

Two consequences to accept and verify:

- **Site typography margins now reach `mech:text`.** A site's `h1 { margin: … }`
  previously lost to the layered-away `margin: var(--el-margin, 0)` floor; now it applies
  (UA margins are still neutralized — any author rule beats UA). This is the "uniform
  style for text" goal working as intended, but existing composed blocks in sites with
  global typography margins will shift — re-shot dev-app blocks/pages when landing.
- The `[style*='--el-maxw']` **auto-centering** rule keys off the inline var, so a
  class-provided max-width doesn't trigger it — a `.container` class should carry its own
  `margin-inline: auto` (which now works, since the margin floor yields).

## 5. Generated elements stylesheet

Configurable breakpoints (§6) force this: media-query widths can't come from CSS
variables, so the responsive rules can't stay in static SCSS. Instead of string-patching
CSS, the whole var-consuming rule set becomes **generated TS**:

- **`src/elements/emit-css.ts`** — a pure, unit-testable
  `emitElementsCss({ md, sm }): string` producing: the `@property` registrations
  (`inherits: false`, all props × 3 suffixes), the `@layer mechanica` floors + md/sm
  fallback chains for *yield* props, the unlayered hard floors, and the knob rungs of §4.
  Driven by one binding table co-located with the `style-vars.ts` specs (data key → var →
  CSS property → fallback → selector kind → yield/hard) — **killing the current
  duplication** between `style-vars.ts` and the SCSS `$el-props` list.
- **`virtual:mechanica/elements.css`** — the plugin serves the emitted CSS as a virtual
  stylesheet, imported by **every generated entry** (client / SSR / preview / composer),
  so all rendering paths carry it, in dev and build. (No `\0` prefix — Vite must see the
  `.css` extension to pipe it through CSS handling.)
- **`elements.scss` shrinks to structure only**: `box-sizing`, `.mxel-frame`
  display/position, `.mxel-image` display + empty-placeholder chrome, `.mxel-slot`. It
  stays statically imported by `src/elements/index.ts` as today (and is all that lands in
  mechanica's own dist CSS — the responsive part is per-site by definition).
- With default widths the emitted CSS is behavior-equivalent to today's
  `elements.scss` responsive section (plus the layer/rungs) — snapshot-test it and assert
  key rules (fallback chains, rung selectors, centering rule) individually.
- The emitter ships in `dist/plugin` (Node build); the browser runtime never imports it.

## 6. Configurable breakpoints

```ts
breakpoints: { md: 900, sm: 560 }   // max-widths in px; defaults 1024 / 640
```

- **Two fixed tiers stay fixed** — the `$bp` data keys (`md`/`sm`), the device switcher,
  icons, and the effective-cascade logic don't change; only the *widths* move. (The
  generated-CSS architecture makes an N-breakpoint future possible without rework, but
  it's out of scope.)
- **Read statically by the plugin.** The plugin already knows `composerFilePath`
  (Node-readable, watched); it extracts the `breakpoints: { … }` object literal from the
  file's source with a small tolerant parse. Documented constraint, in the spirit of the
  `defineBlock` macro and workflow `meta` purity: **the value must be a plain numeric
  literal** — no imports, spreads or computed values. Unparseable / invalid (non-number,
  `sm >= md`) → warn once and fall back to defaults.
- **Consumers:**
  - `emitElementsCss({ md, sm })` — the media-query widths (§5).
  - The generated composer entry injects the values as literals into
    `mountComposerApp({ …, breakpoints })`; `ComposerApp` uses them for the device-button
    titles and the breakpoint-mode banner ("apply at ≤ 900px — tablet & mobile"), and
    clamps the canvas device widths to them (`min(768, md)` / `min(390, sm)`) so the
    canvas always sits inside the breakpoint it's editing.
  - Nothing else: the page editor and runtime read no widths (canvas rendering already
    pre-merges `$bp` via `effectiveData`; real pages use the generated media queries).
- **Dev flow:** the existing `composerFile` watcher additionally invalidates the virtual
  stylesheet + composer entry and full-reloads on change.
- The site's *own* CSS media queries remain the developer's business — the point is they
  and the element system can now agree on one set of numbers, declared where the design
  system already lives.

**Typed groups (added 2026-07-05).** `classes` entries may carry a `group`; same group =
mutually exclusive (one Style select), different groups stack. See §3 — this replaced the
original single-select v1 without a data-model change (`cls` was always a space-separated
string).

## 7. Out of scope (deliberately)

- Classes on placed components / composed-block instances, and on page blocks.
- Parsing the site's CSS to validate or preview class contents — the canvas is the preview.
- Free multi-class chips / per-token ordering (Webflow combo classes) and per-breakpoint
  class switching — typed groups (§3) cover the "base + variant" need cascade-safely; the
  rest stays expressible later without data-model changes (`cls` is a string).
- Renaming/tracking classes across `.block.yml` files when the manifest changes.
- Custom breakpoint *names/counts*.

## 8. Implementation plan

1. **shared**: `ComposerManifest` / `ComposerClassDefinition` / class-input shorthand
   types + a pure `normalizeClassDefs` (unit-tested, DOM-free).
2. **core**: `defineComposer` replaces `defineComposerComponents` (removed; update
   `core/index.ts` exports, dev-app, create-mechanica template).
3. **collect-components.ts**: generate from `manifest.components`; add `classDefs`
   (normalized) to the virtual module; composer entry passes them to `mountComposerApp`.
4. **elements**: append sanitized `data.cls` tokens to Frame/Text/Image class lists
   (and *not* to the `.mxel-slot` wrapper).
5. **emit-css.ts** + binding table; shrink `elements.scss`; plugin serves
   `virtual:mechanica/elements.css`; entries import it. Snapshot + rule-level tests.
6. **Breakpoints**: static extraction (`read-breakpoints.ts`, unit-tested against
   literal/whitespace/comment variants + rejection cases), flow to emitter and composer
   entry; `ComposerApp` titles/banner/canvas widths from options.
7. **Composer UI**: Style row in `ComposerInspector` (per-kind class list from store
   options; None + missing-value handling; base-only write + history).
8. **dev-app**: add real classes to its global SCSS (`.container`, a couple of text
   styles), migrate `src/composer.ts`, exercise a class in a composed block.
9. **Tests + typecheck green**; re-shot dev-app blocks/pages (margin consequence, §4).
10. **Docs**: update CLAUDE.md's composer section + this file's status; note the
    `bun run build` requirement (plugin/entries changes need a dev-server restart).

## 9. Verification (headless, against the running dev server)

- Element with `cls: h1` shows the site's `h1` font-size (computed style); setting the
  size knob overrides it; resetting restores it.
- Knob set only for `md`: class value at desktop width, knob value at ≤ md
  (`Emulation.setDeviceMetricsOverride`).
- `.container` on a frame: max-width + centering from CSS alone.
- Custom `breakpoints` in dev-app's manifest move the flip point (resize across it) and
  relabel the composer banner/titles.
- Style select renders, applies, persists to `.block.yml`, survives reload.
- Existing composed blocks/pages re-shot — no unexplained visual drift beyond §4's
  documented margin change.
