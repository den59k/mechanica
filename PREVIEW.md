# Block previews & `mechanica shot`

Blocks are visual components, so authoring them — especially by an AI — needs a
visual feedback loop. Mechanica provides one in three layers:

1. **`previewData`** — a block declares example values for how it should look
   outside a page.
2. **The preview route** — the dev server renders any block standalone at
   `/@mechanica/preview/<blockId>`.
3. **`mechanica shot`** — a CLI that screenshots a block (or a whole page, or a
   design handoff to compare it with) headlessly and reports errors, built for
   agent loops: write → shot → look → adjust.

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

# A design handoff or any site, rendered exactly like your pages (no dev server):
mechanica shot design/landing/index.html --width 1440,390
mechanica shot https://example.com/pricing
# Compare section by section: the same selectors on the design and on the page
mechanica shot design/landing/index.html --section "#hero" --section ".pricing"
mechanica shot /landing --section "#hero" --section ".pricing"
# Scroll-driven states: scroll first, then capture the viewport
mechanica shot design/landing/index.html --scroll 1200,2400
```

| Flag | Meaning |
| --- | --- |
| `--page </path>` | Explicit page mode (same as a `/…` target) |
| `--data <json\|@file>` | Prop overrides (block shots only; tolerates a UTF-8 BOM in files) |
| `--width <n[,n…]>` | Viewport width(s); default `1440` (height 900). Multiple widths suffix `-w<n>` |
| `--section <css>` | Clip to the first element matching the selector, in the document or an open shadow root (`#name` also finds the block `[data-block-id="name"]`). Repeat for one PNG per section. Not for block shots |
| `--scroll <px[,px…]>` | Scroll the window there first, then capture the **viewport** (not the whole document). Several offsets give one PNG each |
| `--no-freeze` | Leave CSS animations and transitions running |
| `--out <path>` | Output PNG or directory; default `.mech/shots/` (gitignored) |
| `--server <url>` | Dev server origin; default: probe `localhost:5173`, else boot an ephemeral server |
| `--browser <path>` | Explicit Chromium-based executable (no fallback to another browser) |
| `--full` | The whole document, instead of the block element (block shots) or the viewport (`--scroll`) |

### Targets

The target decides what is rendered, checked in this order:

1. `--page </path>`: that page.
2. `http://…` / `https://…`: the URL, opened as is.
3. `file://…`, a Windows drive path (`C:\…`), a `./` or `../` path, or any path
   ending in `.html` / `.htm`: a local file, relative to the current directory.
4. Anything else starting with `/`: a page of this project.
5. Anything else: a block id.

**Block shots** clip to the block's rendered element, freeze
animations/transitions, and wait for the ready flag. **Page shots** load the
real dev page with the editor overlay stripped (`?mechanica-shot`), wait for
load + fonts + images, and capture the full page (height capped at 12 000 px,
with a printed notice). Page paths are validated against the page store first —
an unknown path fails immediately, listing the real ones.

**URL and file shots** (foreign targets) never look for or start a dev server.
They wait for the load event + fonts + images like a page and capture the full
document. Errors the document logs are echoed but never fail the shot: a design
export often logs errors of its own. A missing file fails before the browser
starts. Under Git Bash, a `/page/path` argument reaches the CLI rewritten into a
Windows path (`C:/Program Files/Git/about`). Write it as `//about`, or set
`MSYS_NO_PATHCONV=1`.

Waiting for images switches `loading="lazy"` images to eager first, so a
full-page capture shows them, and gives up after 10 s, so a stalled request
can't hang the shot.

### Sections

`--section <css>` clips each capture to the bounding box of the first element
that matches. It works for pages, URLs and files. Quote the selector:
PowerShell starts a comment at an unquoted `#`.

- **Shadow DOM.** When nothing in the document matches, the selector is tried
  in every open shadow root, depth first in page order, and matches within
  that root (design handoffs render their sections inside custom elements such
  as `<code-island>`). Slotted content belongs to the page around its host and
  is found there. `host >>> inner` crosses into the shadow root of `host`
  explicitly: `--section "code-island >>> section.pricing"`.
- **Blocks.** Mechanica renders a block with `data-block-id="<node id>"` and no
  `id`, so a bare `#name` (or `name`) that matches nothing falls back to
  `[data-block-id="name"]`: `mechanica shot /landing --section "#hero"` clips
  the `hero` block. A real `id` or tag of that name wins.

A selector that matches nothing, or matches an element with an empty box
(hidden at that width), reports the problem. With "no match", it also lists
the readable ids and the block ids on the page, shadow roots included. The
other sections and widths are still written, and the command exits non-zero.
Sections taller than 12 000 px are capped like full pages.

### Scroll-driven states

Scroll-driven sections (sticky stages, pinned strips, content revealed on
scroll) only show their later states when the page is actually scrolled.
`--scroll <px>` scrolls the window there instantly (ignoring
`scroll-behavior: smooth`), waits two frames and for fonts and images, and then
captures. The order matters: the page's scroll handlers and transitions start
**before** the freeze, and the freeze then ends running transitions at their
final values. Without `--full`, the capture is the **viewport**, so a sticky
element is where the visitor would see it. With `--section`, the clip still
follows the element (sticky children stay where the scroll put them). If the
page is shorter than the offset, a notice says how far it actually scrolled.

`--no-freeze` skips the freeze entirely, and the capture shows animations
mid-flight. `prefers-reduced-motion: reduce` stays emulated either way. That
way a `--no-freeze` shot sees the same media as a frozen one, and pages that
honor the query jump to their end states. A page that ignores the query animates
as usual.

### File names

The default name is the block id, `page-<slug>` for a page, or, for a foreign
target:

- a URL: its host (without `www.`, port appended) and path, extension dropped.
  `https://example.com/business/evolve` → `example-com-business-evolve`.
- a file: its path relative to the current directory (its last three segments
  when it lies outside), extension dropped.
  `design/evolve-level/index.html` → `design-evolve-level-index`.

Each capture then appends `-<section>` (the selector slugged: `#hero` → `hero`,
`.stage > .pin` → `stage-pin`, repeats get `-2`), `-y<scroll>`, and `-w<width>`
when several widths are shot. For example:
`design-evolve-level-index-hero-y800-w390.png`. An `--out` ending in `.png` is
used as the file name, with the same suffixes added when there are any.

Output is agent-friendly:

- `✓ <path>` per written PNG.
- `[console.error]` / `[console.warning]` / `[pageerror]` lines echoed from the
  page.
- Non-zero exit when the block failed to render (with available block ids in
  the message), the page threw, or a `--section` could not be captured.

## 4. Page thumbnails (`mechanica thumbs`)

The editor's page browser shows the highlighted page in a live side preview,
so at 100 pages you scan by shape, not just by name. Thumbnails are generated
**on demand by a command**, not automatically:

```bash
mechanica thumbs            # thumbnail every page
mechanica thumbs /docs      # only pages under /docs
```

- Each page renders at 1200px wide (editor overlay stripped) and its top —
  up to 2000px, clipped to the page's real height — is captured natively
  downscaled to 480px wide into `.mech/thumbs/<slug>.png`
  (gitignored; `/` → `index.png`, `/docs/api` → `docs-api.png`).
- The dev server serves the directory at `/@mechanica/thumbs/…` and the
  PagesDialog shows the hovered page's thumbnail in its preview panel,
  falling back to a monogram tile for pages without one. Regenerating and
  reopening the dialog refreshes them — no editor restart needed.
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
(`packages/mechanica/src/cli/headless.ts`, wrapped as a page object in
`browser.ts`, which is also the public `mechanica/browser` entry for a site's
own scripts). Playwright/Puppeteer are deliberately
not used: their launch handshake relies on Node-only fd pipes that hang under
Bun, and a screenshot needs only a handful of CDP calls. The command finds a
Chromium-based browser already on the machine — on Windows Chrome, then Edge
(it ships with Windows); on macOS Chrome, Edge, Chromium; on Linux Chrome,
Chromium, Edge — spawns it headless with `--remote-debugging-port`, and
connects to the endpoint it prints. A browser that exits before printing it,
or never prints it, is shut down with every process it started (on Windows
including an instance it relaunched), its temporary profile is removed, and
the next installed browser is tried; the error names each one and why it
failed. `--browser <path>` tries only that executable. On Windows the browser
starts without `__COMPAT_LAYER` (Git Bash and some tool runners set it), which
otherwise makes Edge relaunch itself and exit at once. **Zero dependencies,
nothing to download.**
