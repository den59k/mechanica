# `defineCollection` — sugar over `generatePages` (deferred)

Status: **deferred — not built.** Sugar on top of the `generatePages` primitive
(see [GENERATED-PAGES.md](./GENERATED-PAGES.md)). Written up so we can pick it up when a
real need appears; **do not build it speculatively** (see "When to build").

## Idea

`generatePages` takes a `PageProvider` — a function returning `VirtualPage[]`. The most
common case is "a folder of content files → one route each". `defineCollection` would be a
declarative helper for that case, returning a `PageProvider` so nothing in core changes:

```ts
// vite.config.ts
mechanica({
  generatePages: [
    defineCollection({
      base: '/blog',
      source: 'src/content/blog/[locale]/**/*.md',  // glob; [locale] captured for i18n
      block: 'post',                                 // block that renders each entry
      data: (entry) => ({ head: { title: entry.frontmatter.title } }),
      // filter?, render?, lastmod? … see "Required hooks"
    }),
  ],
})
```

It groups files by slug across locales, reads frontmatter, and emits one `VirtualPage` per
(slug × locale) — exactly what a hand-written provider does, minus the boilerplate.

## Non-goals

- **Not a core change.** It's a pure function that returns a `PageProvider`; `generatePages`
  already does all the routing/export/dev/i18n work. Ships as an exported helper from
  `mechanica/plugin` (or stays in userland).
- **Not a Markdown engine.** Mechanica has no opinion on how content renders. Rendering is
  the site's job (a `render`/`data` hook), not baked into the helper.

## Required hooks (the lessons from the LeCodes API Reference)

The first real consumer (the `lecodes-landing` API docs, `api-pages.ts`) is **not** a vanilla
glob→page mapping. A generic helper is only worth building if it cleanly supports what that
provider does by hand — otherwise the explicit provider (~50 lines) is simpler. Concretely it
must offer:

1. **A per-entry `render`/`data` hook, not a built-in renderer.** That provider renders
   Markdown to HTML **at build time** with a *site-specific* pipeline (`renderApiDoc` — custom
   `::: note` callouts, `.md`→route link rewriting) and bakes `html`+`outline` into the block
   data so the client ships no Markdown parser. A built-in Markdown renderer would not match;
   the helper must let the author produce the block(s) + data per entry.
2. **A `filter`.** That site generates only pages flagged `ready` in a nav taxonomy
   (`apiNav.ts`) — `src/api/en/**` holds 54 mirror files but only 3 are live. A plain glob
   would emit all 54. The helper needs `filter(entry) => boolean` (or `include`).
3. **Per-locale `data`/`head`.** Titles and content differ by locale; the hooks receive the
   entry's `{ slug, locale, frontmatter, path }`.
4. **`lastmod`** from the file mtime (for the sitemap), overridable.
5. **`[locale]` in the source glob** → the i18n grouping (one `VirtualPage` per slug×locale,
   `locales` = the set present), matching how the provider self-declares locales.

If those hooks are all present, `defineCollection` for the API docs is roughly:

```ts
defineCollection({
  base: '/docs/api',
  source: 'src/api/[locale]/**/*.md',
  filter: (e) => isReady(e.slug),                       // apiNav `ready`
  render: (e) => {                                       // build-time HTML bake
    const { html, outline, title } = renderApiDoc(e.raw)
    return { content: [{ blockId: 'api-doc', data: { src: e.slug, html, outline } }],
             data: { layout: { variant: 'docs', activeNav: 'api' },
                     head: { title: `${title} — …` } } }
  },
})
```

Note this is barely shorter than the imperative provider — which is exactly why it's deferred
for a single collection.

## Sketch of the config

```ts
interface CollectionConfig {
  /** Route prefix, e.g. `/blog`. */
  base: string
  /** Content glob; a literal `[locale]` segment is captured for i18n. */
  source: string
  /** Keep an entry (default: all). */
  filter?: (entry: CollectionEntry) => boolean
  /**
   * Produce the page's content + data from an entry. Either return block(s)
   * directly, or give a `block` id + `data` and let the helper wrap it.
   */
  render?: (entry: CollectionEntry) => { content: ContentBlock[]; data?: Record<string, unknown> }
  block?: string
  data?: (entry: CollectionEntry) => Record<string, unknown>
  /** Sitemap lastmod (default: file mtime). */
  lastmod?: (entry: CollectionEntry) => string | undefined
}
interface CollectionEntry {
  slug: string            // path under source, minus the [locale] segment + extension
  locale?: string         // from the [locale] capture
  path: string            // absolute file path
  raw: string             // file contents
  frontmatter: Record<string, unknown>
}
function defineCollection(config: CollectionConfig): PageProvider
```

## When to build

Build it when one of these is true — not before:

- **A second/third collection of the same shape appears** (blog + guide + examples + changelog
  on one site) and the provider boilerplate visibly repeats.
- **We want it as a first-class Mechanica feature** for other users of the library who want
  "files → pages" without writing a provider (the main product value).

For a single custom collection, prefer a hand-written `PageProvider` — it's clearer and the
helper saves little.

## Open questions

- Frontmatter parser: reuse the `.page.md` YAML parser, or a generic `gray-matter`-style read?
  (The API docs use their own front-matter convention.)
- `[locale]` capture vs a separate `locales` option — which is less magic?
- Does the helper own `lastmod`/`meta`, or leave it entirely to `render`?
- Editor: generated pages are already read-only (Phase 2); nothing collection-specific.
