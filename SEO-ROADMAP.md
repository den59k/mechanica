# SEO — deferred follow-ups

What's already shipped (July 2026): automatic canonical / `og:url` / absolutized
social-image tags, pagination titles + `rel=prev/next`, WebSite + BreadcrumbList
JSON-LD, `sitemap.xml` with `<lastmod>`, `robots.txt`, `meta.noindex`,
`public/` files in the export, the export-time SEO lint, `{{ site.* }}` /
`{{{ raw-json }}}` templating, and `alt`/`width`/`height` on the image field
(see the **SEO** section of [CLAUDE.md](./CLAUDE.md)). This file describes the
follow-ups that were considered and deliberately deferred, so any of them can
be picked up later without re-deriving the design.

---

## 1. Responsive image pipeline (biggest remaining lever)

**What:** at export, generate resized variants + modern formats (WebP/AVIF) for
uploaded images and let blocks emit `srcset`/`sizes`.

**Why:** image weight dominates LCP on content sites, and Core Web Vitals are a
ranking signal. Today `copyUploads` ([export.ts](packages/mechanica/src/cli/export.ts))
copies `.mech/assets` files byte-for-byte — a 4 MB photo ships as 4 MB.

**Design sketch:**
- The field shape is already future-proof: `{ src, previewSrc?, alt?, width?, height? }`
  — variants can be derived from `src` without changing stored page data.
- Do the work in `copyUploads`: for each referenced raster image, emit
  `/media/<name>.<w>.webp` for a fixed width ladder (e.g. 480/960/1440), capped
  at the intrinsic width. Memoize by content hash so re-exports are cheap.
- Rewriting URLs in page state is not enough for `srcset` — blocks need to
  *render* it. Ship a small `<Image>` component from the runtime (see §5)
  that builds `srcset` by convention from `src` + the ladder; the export
  guarantees the files exist.
- The optional-`sharp` plumbing **already exists** (July 2026):
  `src/vite/dev/image-preview.ts` resolves `sharp` from the *site's* project
  root (never a mechanica dependency) and powers upload-time LQIP, the
  `mechanica images` command, and the export-time metadata backfill — all
  cached in the image manifest (`.mech/images.json`). The ladder reuses that
  loader, the manifest (add a `variants` field per asset), and the same
  export-side walk over image fields — what's left is variant generation,
  emission, and the `srcset` convention in `<Image>`.

**Size:** the largest item here — variant generation + `<Image>` srcset +
tests. Do last.

## 2. Auto OG images (`mechanica og-images`)

**What:** generate a social-preview PNG per page by screenshotting a card-style
route, and point `og:image` at it.

**Why:** link previews (Slack/X/Telegram) are the most visible SEO-adjacent
surface, and most sites never design per-page cards. We already own 90% of the
machinery: `mechanica thumbs` walks every page headless over raw CDP
([thumbs.ts](packages/mechanica/src/cli/thumbs.ts), shared plumbing in
[headless.ts](packages/mechanica/src/cli/headless.ts)).

**Design sketch:**
- New CLI command reusing the thumbs walk at a fixed 1200×630 viewport,
  writing to `.mech/og/<slug>.png` (gitignored) or straight into the export.
- v1 can literally screenshot the page top (thumbs already does); v2 renders a
  dedicated card route (`/@mechanica/og/<path>`) — site name + page title over
  brand colors — so cards look designed, not cropped.
- Export integration: when `export/og/<slug>.png` exists for a page and its
  head has no `og:image`, inject one (same non-duplication rule as
  `applySeoTags`).

**Size:** small CLI addition + one export hook. High visible payoff.

## 3. Redirects (`redirectFrom` frontmatter)

**What:** `redirectFrom: [/old-path, /older-path]` in the page envelope; the
export emits redirects for each old URL.

**Why:** `renamePage` currently orphans the old URL — inbound links 404 and
accumulated ranking is lost. This is the standard CMS answer.

**Design sketch:**
- Add `redirectFrom?: string[]` to `PageDoc` ([page-format.ts](packages/shared/src/page-format.ts))
  and the serialized-key order; document in [CONTRACT.md](./CONTRACT.md).
- Export: for each old path, write an `index.html` stub —
  `<link rel="canonical">` to the new URL + `<meta http-equiv="refresh">` +
  a JS `location.replace` — and *exclude it from the sitemap*. Meta-refresh-0
  is treated as a permanent redirect by Google; host-level 301 files
  (`_redirects`, `vercel.json`) can be added later per host.
- Collision checks like the pagination-variant guard: an old path that matches
  a real page fails loudly.
- Editor follow-up (optional): `renamePage` offers "keep a redirect from the
  old path", which just appends to the frontmatter.

**Size:** small. Codec + export + tests in an afternoon.

## 4. RSS / Atom feeds

**What:** `mechanica export` emits `/blog/feed.xml` for folders that opt in.

**Why:** feeds are cheap distribution and a freshness signal; blogs expect them.

**Design sketch:**
- Opt-in via folder data (folders already carry scoped data in
  `.mech/folders.json`): e.g. `feed: { title, description }` on the folder.
- Feed items come from the same machinery as `usePages`: `listPages` with
  `folderName`, sorted by a date field, using page `name`, path, and
  `meta`/data hooks for the summary. Full-content items would need the
  rendered HTML — skip; title + link + date + description is plenty.
- Emit `<link rel="alternate" type="application/rss+xml">` on the folder's
  index page (same injection point as `applySeoTags`).
- Builder lives in shared `seo.ts` next to `buildSitemap` — same pattern,
  future backend reuses it.

**Size:** small-medium. Mostly deciding the folder-config shape.

## 5. `<Image>` runtime component (progressive blur-up loading) — ✅ shipped

Implemented (July 2026). `<Image :image="props.image" />` (exported from
`mechanica`, `src/core/image.ts`) renders alt + intrinsic dimensions (no
layout shift), native `loading="lazy"` + `decoding="async"`, and the field's
LQIP `previewSrc` — a ~24 px data URI the editor generates on a canvas at
pick/upload (`analyzeImageFile`) — as a blurred background until the real
image loads. `eager` switches to `loading="eager"` + `fetchpriority="high"`
for above-the-fold heroes. Deferral is deliberately native (no
IntersectionObserver swap: it would hide `src` from crawlers and complicate
hydration). dev-app's Banner is the reference block. The §1 srcset ladder
plugs into this component.

## 6. Article/Product JSON-LD presets (documentation, mostly)

**What:** structured data beyond the automatic WebSite/BreadcrumbList.

**Why deferred:** `Article`, `Product` etc. need content-level fields (author,
dates, price) that only the site knows — auto-generating them risks wrong
markup, which is worse than none.

**Already possible today** with the `{{{ }}}` raw-JSON templating: define a
page-scoped `defineData` entry holding the schema.org object and put
`<script type="application/ld+json">{{{ article.schema }}}</script>` in
`index.html`. The follow-up is a documented recipe (dev-app blog example +
a `jsonLd` data entry), not new engine code. Optionally: a `blog` folder
preset in `create-mechanica`'s template.

## 7. dev-app content pass (lint findings)

The new SEO lint flags real issues in the playground: `/playground` renders
four `<h1>`s (blocks should use `<h2>` below the hero) and the `/docs` pages
have none. Fixing them is a content/block edit in dev-app — worth doing so the
reference app exports warning-free — but note the `.mech/` fixtures are
user-edited; touch block SFCs, not page files, without asking.

## 8. AI-friendly output (`llms.txt` + Markdown mirror)

**What:** emit the [llms.txt](https://llmstxt.org) convention and a Markdown
twin of every page, so AI agents and answer engines read the site natively
instead of parsing HTML. The headline feature for API-reference sites.

**Why:** AI assistants are becoming a primary consumer of docs-style sites.
Mechanica is unusually well-placed: pages already live as Markdown on disk
(`.page.md`), and richText fields persist as real Markdown through the
vuewrite codec — most platforms have to reconstruct Markdown from their CMS.

**Design sketch:**
- **`/llms.txt`** — site name + description, then a link list of pages with
  one-line descriptions. Every input exists at export time: page paths, editor
  `name`s, `head.description` from page data. `buildLlmsTxt` lives in shared
  `seo.ts` next to `buildSitemap`, emitted when `siteUrl` is set; respects
  `draft`/`noindex` like the sitemap. Links point at the Markdown twins when
  they exist, else at the HTML pages.
- **Markdown mirror** — emit `<path>/index.md` alongside each `index.html`,
  advertised via `<link rel="alternate" type="text/markdown">` (same
  injection point as `applySeoTags`). Optionally concatenate everything into
  `/llms-full.txt` for one-shot ingestion.
- **Block → Markdown contract** — richText fields serialize through the
  existing vuewrite Markdown codec (`buildRichTextCodec`); structured blocks
  opt in with a `toMarkdown(data)` in `defineBlock` (rides the SSR-bundle
  metadata like `previewData`); blocks with neither are skipped honestly —
  no magic field dumps.
- API-reference sites should additionally ship their machine-readable spec
  (`public/openapi.json` reaches the export) and link it from `llms.txt`;
  generating the endpoint pages *from* the spec as `.page.md` files is the
  intended authoring workflow (see [CONTRACT.md](./CONTRACT.md)).

**Size:** `llms.txt` alone is small (sitemap-shaped, an afternoon). The
Markdown mirror is medium — the `toMarkdown` contract is the real design
decision.

---

**Suggested order:** 8 → 3 → 2 → 4 → 6 → 1 (7 anytime; 5 shipped). §3 and
§8's `llms.txt` half are self-contained quick wins; §8's Markdown mirror wants
the `toMarkdown` contract settled first; §1 should come last — it plugs into
the shipped `<Image>` component.
