# Block previews & `mechanica shot`

Blocks are visual components, so authoring them — especially by an AI — needs a
visual feedback loop. Mechanica provides one in three layers:

1. **`previewData`** — a block declares example values for how it should look
   outside a page.
2. **The preview route** — the dev server renders any block standalone at
   `/@mechanica/preview/<blockId>`.
3. **`mechanica shot`** — a CLI that screenshots a block (or a whole page)
   headlessly and reports errors, built for agent loops: write → shot → look →
   adjust.

The intended workflow, human or agent: **after creating or visually changing a
block, `mechanica shot <blockId>` and look at the PNG; after authoring or
editing a `.page.md`, `mechanica shot </its/path>`.** Keep the dev server
running while iterating — `shot` reuses it and drops from a few seconds to
about one.

---

## 1. `previewData`

Schema defaults alone make dull previews (a hero titled `""` screenshots as a
gray void). A block declares the values that show it off:

```vue
<script setup lang="ts">
const props = defineBlock({
  name: 'Hero',
  props: {
    title: { type: 'string', default: 'Hello' },
    subtitle: 'text',
  },
  previewData: {
    title: 'Build sites visually',
    subtitle: 'Blocks are plain Vue components.',
  },
})
</script>
```

- Merged **over** schema defaults (deep-merge: objects merge, arrays and
  scalars replace), so it only needs the props that matter visually.
- Used by the palette hover preview in the editor, the preview route, and
  `mechanica shot` — and it doubles as documentation of what the block expects.
- Give every new block meaningful `previewData`.

### Slots: `$slots`

A container block previews its slots too. A `$slots` key fills them with child
blocks; each child resolves its **own** `previewData`/defaults, recursively
(depth-capped at 4, so self-referencing previews can't loop):

```ts
defineBlock({
  name: 'Split',
  previewData: {
    $slots: {
      start: [{ blockId: 'card', data: { title: 'Start column' } }],
      // `end` not authored → renders as a labelled placeholder box
    },
  },
})
```

Slot entries are `{ blockId, data?, slots? }` — `data` overrides the child's
own preview values, `slots` fills the child's slots in turn. Any slot without
authored content renders as a dashed **`slot: <name>`** placeholder, so a
layout block's structure is verifiable with zero authoring.

---

## 2. The preview route (dev server)

```text
GET /@mechanica/preview/<blockId>[?data=<url-encoded JSON>]
```

Renders one block standalone — no page, no editor — but *not* naked:

- The user's app module is imported for its side effects (global CSS, fonts,
  registered data entries) without mounting the root component, so the block
  looks the way it does on a real page.
- A real runtime context is provided, so `useRouter` / `useData` / `Link` work.
  Site-scope data is fetched so shared-data blocks (headers, footers) render
  real values.
- `?data=` merges over `previewData` over schema defaults.

The page signals state for headless tooling: `window.__MECHANICA_PREVIEW_READY__`
turns `true` once fonts and images have settled, and
`window.__MECHANICA_PREVIEW_ERROR__` carries any render error (unknown block,
thrown setup, …). It's also a normal Vite page — open it in a browser and HMR
applies while you edit the block.

---

## 3. `mechanica shot`

```bash
mechanica shot hero                          # block → .mech/shots/hero.png
mechanica shot hero --data '{"title":"Hi"}'  # override props (or --data @file.json)
mechanica shot hero --width 1440,768,390     # one PNG per viewport width
mechanica shot /docs/rich-text               # whole page (target starts with /)
mechanica shot / --width 390                 # the root page, mobile width
```

| Flag | Meaning |
| --- | --- |
| `--page </path>` | Explicit page mode (same as a `/…` target) |
| `--data <json\|@file>` | Prop overrides (block shots only; tolerates a UTF-8 BOM in files) |
| `--width <n[,n…]>` | Viewport width(s); default `1440`. Multiple widths suffix `-w<n>` |
| `--out <path>` | Output PNG (single width) or directory; default `.mech/shots/` (gitignored) |
| `--server <url>` | Dev server origin; default: probe `localhost:5173`, else boot an ephemeral server |
| `--browser <path>` | Explicit Chromium-based executable |
| `--full` | Full page instead of clipping to the block element |

**Block shots** clip to the block's rendered element, freeze
animations/transitions, and wait for the ready flag. **Page shots** load the
real dev page with the editor overlay stripped (`?mechanica-shot`), wait for
load + fonts + images, and capture the full page (height capped at 12 000 px,
with a printed notice). Page paths are validated against the page store first —
an unknown path fails immediately, listing the real ones.

Output is agent-friendly:

- `✓ <path>` per written PNG.
- `[console.error]` / `[console.warning]` / `[pageerror]` lines echoed from the
  page.
- Non-zero exit when the block failed to render (with available block ids in
  the message) or the page threw.

## 4. Page thumbnails (`mechanica thumbs`)

The editor's page browser shows a small thumbnail next to each page, so at
100 pages you scan by shape, not just by name. Thumbnails are generated **on
demand by a command**, not automatically:

```bash
mechanica thumbs            # thumbnail every page
mechanica thumbs /docs      # only pages under /docs
```

- Each page renders at 1200×900 (editor overlay stripped) and is captured
  natively downscaled to 320px wide into `.mech/thumbs/<slug>.png`
  (gitignored; `/` → `index.png`, `/docs/api` → `docs-api.png`).
- The dev server serves the directory at `/@mechanica/thumbs/…` and the
  PagesDialog lazy-loads them per row, falling back to a monogram tile for
  pages without a thumbnail. Regenerating and reopening the dialog refreshes
  them — no editor restart needed.
- One warm browser tab renders all pages sequentially (about a second per
  page against a running dev server). A page that fails to render is reported
  and skipped; thumbnails of deleted pages are cleaned up on full runs.
- Re-run it whenever thumbnails feel stale — after a content editing session,
  or after restyling blocks. Flags: `--out <dir>`, `--server <url>`,
  `--browser <path>`.

## 5. Block thumbnails (`mechanica thumbs --blocks`)

The palette's block cards carry the same treatment: a rendered miniature of
each block, so the palette scans like a component library instead of a text
menu.

```bash
mechanica thumbs --blocks           # thumbnail every palette-visible block
mechanica thumbs --blocks pricing   # only ids matching / starting with "pricing"
```

- Each block renders through the standalone preview route (so `previewData`
  and schema defaults resolve, slots show their placeholders) at 1200px wide,
  clipped to the block's own height (capped at 900), and is captured
  downscaled to 240px wide into `.mech/thumbs/blocks/<blockId>.png`.
- The palette lazy-loads them per card from `/@mechanica/thumbs/blocks/…`,
  keeping the icon/monogram tile as the fallback for blocks without one.
- Hidden blocks are skipped (they're not in the palette); thumbnails of
  deleted blocks are cleaned up on full runs. Same flags as page thumbs.
- **A mostly-empty thumbnail is a signal**: the block probably lacks
  `previewData` and its main content is an array (which defaults to empty).
  Author `previewData` and re-run.

### How it works (and why no Playwright)

`shot` drives a browser over **raw CDP on the platform `WebSocket`**
(`packages/mechanica/src/cli/shot.ts`). Playwright/Puppeteer are deliberately
not used: their launch handshake relies on Node-only fd pipes that hang under
Bun, and a screenshot needs only a handful of CDP calls. The command finds a
Chromium-based browser already on the machine — Edge (ships with Windows),
Chrome, or Chromium — spawns it headless with `--remote-debugging-port`, and
connects to the endpoint it prints. **Zero dependencies, nothing to download.**
