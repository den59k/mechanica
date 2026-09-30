# Generated pages (`generatePages`) — design note

Status: **approved for implementation** (Phase 1). Incorporates the dev review.

## Problem

Today **one page = one file** (`.mech/pages/**.page.md`). Reference sites, blogs from
data, or a product catalog force N hand-written wrappers (54 API pages × 2 locales = 108
near-identical files). We want to generate those routes programmatically — and shape it so
a **future SaaS backend** (holds the server-side project + config, drives webhook updates)
can reuse the exact same seams for incremental regeneration.

The machinery to serve **non-file pages already exists**: pagination renders `/blog/2 …
/blog/N` as real HTML at export (`export.ts:600-636`, guard `:625`) and resolves them
virtually in dev (`buildPageState` → `paginatedVariantOf`, `page-state.ts:52-56`). This
note generalizes that one proven pattern instead of adding a parallel subsystem.

## Guiding principle — `VirtualPage[]` is the currency

The interface between **"where pages come from"** and **"how they're rendered/served"** is
a list of plain, serializable `VirtualPage` objects. Two producers consume it:

- **Static export (now)** — the plugin runs providers at build, bakes the `VirtualPage[]`,
  the CLI renders them to HTML.
- **SaaS backend (future)** — the same providers, server-side; `list()` for enumeration +
  sitemap, `resolve(path)` for on-demand/webhook regeneration through the existing
  `render(state)` contract.

Keeping `VirtualPage` as the stable currency and splitting the provider into
`list` / `resolve` is what lets the future system exist **without reworking Phase 1**.

## Non-goals

- **Not** a content/Markdown engine in core. A route renders a normal `ContentBlock[]`;
  parsing, collection grouping, i18n mapping live in the **provider** (userland) or an
  optional `defineCollection` helper on top.
- **Not** editor-authorable. Generated pages are **read-only** — see the boundary below.
- **Not** a router change (SPA router only parses embedded `window.state`).

## Public API

`MechanicaPluginOptions` (`packages/mechanica/src/vite/plugin.ts:61`) gains:

```ts
generatePages?: PageProvider[]
```

Forward-compatible provider shape — a bare function **is** `list` (Phase 1); the object form
reserves `resolve`/`revalidate` for the future backend (not implemented in Phase 1, but the
type + call sites are shaped for it):

```ts
// plugin options module (build-side; takes fs paths) — NOT the shared barrel
type PageProvider =
  | ((ctx: PageProviderCtx) => VirtualPage[] | Promise<VirtualPage[]>)   // = list
  | {
      list(ctx: PageProviderCtx): VirtualPage[] | Promise<VirtualPage[]>
      /** future: render one path without enumerating — powers backend ISR + big-catalog dev */
      resolve?(path: string, ctx: PageProviderCtx): VirtualPage | null | Promise<VirtualPage | null>
      /** future: cache/revalidation hint for the backend */
      revalidate?: number | ((page: VirtualPage) => number)
    }

interface PageProviderCtx { root: string; mechDir: string; locales: LocalesConfig | null }
```

`VirtualPage` is **data** → lives in `mechanica-shared` (barrel-exported; the mapping to
`ExportPage` and the future runtime both use it):

```ts
interface VirtualPage {
  path: string                 // LOGICAL path (unprefixed); the mapping localizes it
  content: ContentBlock[]      // block tree (usually one template block)
  data?: Record<string, unknown>   // page-scoped data (head, layout, block props…)
  meta?: PageMeta              // { title?, noindex?, lastmod? … }
  locale?: string              // this page's locale (default when omitted)
  locales?: string[]           // every locale this logical page exists in → hreflang/switcher
  lastmod?: string             // sitemap <lastmod> (provider supplies it — no fs stat)
}
```

A provider returns **one `VirtualPage` per (logical page × locale)**: same logical `path`,
distinct `locale`, its own `data`/`content` (docs: identical block, language via
`useLocale()`; products: per-locale fields baked into `data`). The mapping computes the
served/export path with `localePath(page.path, locale, config)` and sets `translations`
from `locales` — the provider never encodes the `/en` prefix rule.

### Reference usage (this repo's API docs)

```ts
export const apiPages: PageProvider = ({ locales }) => {
  const out: VirtualPage[] = []
  for (const slug of globApiSlugs()) {                 // 'math/mathf', …
    const locs = localesWithFile(slug)                 // ['ru','en']
    for (const locale of locs) out.push({
      path: slug === 'index' ? '/docs/api' : `/docs/api/${slug}`,
      locale, locales: locs,
      content: [{ blockId: 'api-doc', data: { src: slug } }],
      data: { layout: { variant: 'docs', activeNav: 'api' }, head: {…},
              // the index page bakes its own link list — no usePages() needed
              ...(slug === 'index' ? { apiIndex: buildLinkList() } : {}) },
      lastmod: mtimeOf(slug, locale),
    })
  }
  return out
}
// vite.config.ts →  mechanica({ locales: {...}, generatePages: [apiPages] })
```

## Delivery — run in the plugin, bake the output (the corrected fork)

`siteUrl`/`locales` are baked into the SSR bundle by `generateSsrEntry`
(`export const locales = ${JSON.stringify(...)}`) and imported by `exportProject` from
`dist/ssr.js` (`export.ts:713`). The export CLI **never loads the Vite config** — it's a
one-way "plugin bakes serializable data → CLI consumes the bundle" flow.

Provider **functions** aren't serializable, but their **output is pure JSON**. So:

1. **Build**: the plugin holds `options.generatePages` as real functions. Right before it
   emits the SSR entry it `await`s each provider's `list(ctx)` and bakes the combined
   `VirtualPage[]` — `export const generatedPages = ${JSON.stringify(pages)}` on
   `SsrEntryOptions` (~5 lines, mirrors `locales`).
2. **Export**: `exportProject` reads `ssr.generatedPages`, maps each to an `ExportPage`
   (localize `path`, set `logicalPath`/`locale`/`translations`/`lastmod`), and merges into
   the `pages` array at `export.ts:385` — before the i18n loop, so the collision guard
   (`:625`) and `knownPaths` cover them. Downstream render/SEO/sitemap operate on the
   object unchanged.
3. **Dev**: the plugin already holds the functions — it runs `list()` at server start into
   an in-memory route map; no baking. (Rebuild the map when the provider's source changes;
   MVP accepts a dev restart, like a `locales` change.)

**Scale escape hatch:** a large catalog bloats the SSR module as a JS literal. When it
bites, emit a sidecar `dist/generated-pages.json` (exactly like `dist/mechanica-blocks.json`)
and have `runExport` read it and pass it into `exportProject` via options — same data-flow,
no module bloat. Either way: **serialize the output, never run providers in the CLL.**

This also keeps the test plan honest: the fake `SsrBundle` in `export.test.ts` just sets
`generatedPages` — no Vite build, no config load.

## Downstream changes (owned honestly — not "zero")

Most of the pipeline is untouched, but three spots need edits:

1. **Breadcrumbs.** `breadcrumbsFor` keeps only trail segments present in `pageNames`
   (`export.ts:209`), and `pageNames` is built from `defaultPages` only (`:551-556`). A
   generated leaf's crumb — and any generated ancestor like `/docs/api` — would drop from
   the BreadcrumbList JSON-LD. **Fix:** add generated pages to `pageNames`, keyed by
   `logicalPath`, named from `meta.title`.
2. **Dev delivery + state shape.** `buildPageState(mechDir, urlPath, config)` has no
   route-map param and two callers (`plugin.ts:604`, `middleware.ts:141`). Check the route
   map in the plugin **before** delegating (or thread a `virtualPages` arg). The synthesized
   state must **replicate a real page's state**: the site‹folder‹page data merge
   (`page-state.ts:106-118`), `page.locale`/`page.locales`, and `version: null`.
3. **Read-only is a Phase-1 correctness item, not polish.** A generated page still renders
   the live editor overlay in dev; the editor debounce-saves to `page.path` → no file → a
   broken save against a nonexistent page. The synthesized state carries `generated: true`
   (or an absent `version`) that the editor honors as **read-only now**.

## Read-only is the architectural boundary (why it matters for the backend)

The `generated: true` flag is not just a dev footgun guard — it is the line between
**editor-owned pages** (authored `.page.md`, hand-edited, synced by the future backend) and
**provider-owned pages** (from the external source, updated by the webhook path). The editor
never writes a provider-owned page; the provider/webhook never touches an authored one. The
future backend relies on exactly this split: content editing + local sync operate on
authored pages; webhook regeneration operates on generated ones.

## Future-backend compatibility (design, not built now)

- **Enumeration vs on-demand.** `list()` (Phase 1) feeds SSG, sitemap, dev map. `resolve(path)`
  (reserved) lets the backend render one product page on a webhook without walking the
  catalog — and lets dev resolve lazily for huge remote sources. Same `VirtualPage` out.
- **Rendering.** The backend regenerates a page through the existing `render(state)` SSR
  contract with the `VirtualPage`'s `content`+`data` — the same object the static path bakes.
- **Config.** The backend stores the project config incl. `generatePages`; it runs providers
  server-side (execute config, or — a later convention — import provider modules directly for
  a Vite-free fast path). No Phase-1 decision needed; the function-in-options shape doesn't
  block it.

## Free wins (state them)

- Generated routes are **valid internal-link targets** — the export's dead-link validator
  sees them (they're in the `pages` set), so authored pages linking to `/docs/api/...` stop
  warning.
- **Compose with pagination for free** — both passes key off the same array + guard.
- **hreflang/sitemap/SEO** work off the object via `alternatesFor` (`export.ts:559`) +
  `translations`.
- **Phase 1 is sufficient for the API-docs use case.** The provider already has the slug
  list, so the API index bakes its link list into that page's `data`; `usePages()` listing
  (Phase 2) is a nice-to-have, not a blocker.

## Phases

1. **Core + export + dev + tests** — ✅ **done** (alpha.6/7). Option/types, build-time
   bake, export merge + `pageNames`, dev route map + `buildPageState` branch +
   state-shape replication + the `generated`/read-only flag.
2. **Editor + queries** — ✅ **done**. `listPages` gains a `generated?: VirtualPage[]`
   option (one read-only row per logical page, `generated: true`), threaded through the
   dev `/pages` + `/query` endpoints and the export `querySource`; so generated pages
   show in `PagesDialog` (with a "Generated" badge, no edit actions), resolve in
   `usePages()`, and pass `mechanica shot`'s page-exists check. Every write endpoint
   (`/save`, delete, rename/move, duplicate, draft, translation) rejects a generated
   path (409); the editor renders them read-only (`state.generated`).
3. **Sugar + backend hooks** — pending. `defineCollection` over `generatePages` (deferred —
   spec in [DEFINE-COLLECTION.md](./DEFINE-COLLECTION.md); build only when a second collection
   of the same shape appears); wire `resolve`/`revalidate` when the backend lands.

## Tests

- `packages/mechanica/test/cli/export.test.ts` — fake `SsrBundle` with `generatedPages`
  (no Vite build): provider of 2 slugs × 2 locales → assert HTML at `/…` and `/en/…`,
  hreflang alternates, sitemap entries, **breadcrumb JSON-LD includes the generated trail**.
  Pagination fixture (`paginatedSsr`) is the template.
- `packages/mechanica/test/vite/dev/page-state.test.ts` — a virtual URL resolves to
  synthesized state (data-merge applied, `page.locale` set, `version: null`, `generated`).
- `packages/shared/test/generate-page.test.ts` — extend if `VirtualPage → ExportPage`
  mapping lands in shared.

Green bar: `bun run --filter mechanica test` **and** `... typecheck`. Node-side change →
`bun run build` + dev restart.

## Obstacles (all addressed above)

fs-based `getPagePath`/`readPage` (branch in `buildPageState`) · editor write paths assume
a file (`generated` read-only flag) · i18n from `@locale` files (routes self-declare
`locale`/`locales`) · `lastmod` from `stat` (provider supplies it) · path collisions
(reuse `:625`) · breadcrumbs from `pageNames` (add generated) · SSR-module bloat (sidecar).
