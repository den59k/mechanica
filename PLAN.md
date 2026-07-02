# Mechanica — architecture & roadmap

For orientation: what v2 is built on, what already works, and what comes next.
(The authoritative per-area docs are [CLAUDE.md](./CLAUDE.md) for conventions and
[CONTRACT.md](./CONTRACT.md) for the `.page.md` format.)

## Architecture in one paragraph

Authors write Vue SFC **blocks** (`defineBlock` macro, compiled away at the
source level by the Vite plugin). The in-page **editor** arranges blocks into
pages and persists them through the dev server into `.mech/` as human-readable
**`.page.md`** files (rich text as Markdown on disk, `vuewrite` JSON in state).
Pages render through a **mode-aware runtime** (`client | server | dev`, context
over env-branching) and export statically via `mechanica export`; the same SSR
entry is the contract a future hosted backend will call.

## Done (local development phase)

- **Compiler & plugin** — source-level `defineBlock` rewrite (Vite-8-proof),
  blocks virtual module, HMR: block add/remove/schema-change re-collects and
  reloads; broken blocks fail loudly (overlay), duplicate `defineBlock` is a
  compile error.
- **Persistence** — `.page.md` codec (lossless round-trip), scoped data
  (site/folder/page), atomic writes, optimistic concurrency (409 + conflict UI:
  Reload / Keep mine), live sync of external edits into the open editor
  (Claude co-authoring is a first-class flow).
- **Schema evolution** — `defineBlock({ version, migrate })`: placed blocks
  record the schema version they were written with (`v=` fence attribute);
  older data migrates on load (dev + export) and persists on next save; export
  warns about pages referencing deleted block types.
- **Editor** — overlay panels (never move the page), palette with categories +
  live hover previews, card thumbnails (`mechanica thumbs --blocks`), a
  recently-used row, and in-category sorting via `defineBlock`'s `order`,
  hierarchy tree, undo/redo, save-status indicator,
  unload-safe saves (beacon flush), Ctrl/Cmd+K quick switcher (**pages only**),
  in-place page switching (no reload, back/forward aware), folder-scoped
  blocks (`folders: ['docs']` in `defineBlock`), page browser with thumbnails
  (`mechanica thumbs`).
- **Export** — static SSG with data scoping and `{{ }}` head templating,
  uploads copied to `/media/`, dead-link + orphan-asset warnings, `404.html`,
  `sitemap.xml` (`--site-url`), loud failure on a missing `#app`.
- **Per-page code splitting** — the client build turns
  `virtual:mechanica/blocks` into `blockLoaders` (one chunk + CSS per block);
  the entry awaits only the page's blocks before hydrating, exported pages get
  per-page stylesheet/`modulepreload` links (Vite manifest +
  `mechanica-blocks.json`), and SPA navigation loads missing chunks before the
  content swap. Dev and SSR stay eager.
- **Queries & pagination** — one query engine (`@mechanica/shared`
  `query-engine.ts` over a `QuerySource`) behind `usePages` (folder filter,
  data embedding, sort, limit), `usePagination` (reactive pager), and
  `useFetch` (server-side, baked at export). Dev resolves live via
  `/@mechanica/query`; export resolves at build time, memoizes per key, and
  bakes results into `window.state.query`; SSR contract:
  `render(state, { resolveQuery }) → { html, query }`. Paginated pages split
  into **real exported pages** (`/blog/2`…, sitemap'd, collision-checked);
  dev serves variant URLs virtually. Demo: dev-app `/blog`.
- **CLI** — `build`, `export`, `push` (legacy v1 contract), `shot`, `thumbs`.

## Next

1. **SaaS / hosted backend** (deferred by design) — extract a transport
   interface over `/@mechanica` + the bridge (postMessage/iframe-ready,
   version-negotiated), define the backend `render(state)` contract against
   the existing SSR entry, redesign `push` (auth, versioning, rollback).

## Invariants to keep

- `defineBlock` stays the only macro; creating a block must stay trivial.
- `@mechanica/shared` stays DOM-free (a render service must import it).
- Editor panels overlay the page — dev always shows the page as it is.
- `.page.md` stays the single source of truth, friendly to AI/human edits;
  the editor must never clobber external edits (version check).
- Light theme, calm UI: blue selection, black reserved for primary actions.
