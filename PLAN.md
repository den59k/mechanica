# PLAN.md — Multi-language pages (i18n)

Status: **phases 1–3 implemented & verified** (2026-07-05); phase 4 (polish) deferred. This
replaces the completed Block Composer plan that previously lived here (see
[COMPOSER-REDESIGN.md](./COMPOSER-REDESIGN.md) and [COMPOSER-MANIFEST.md](./COMPOSER-MANIFEST.md)
for that work).

## Implementation status (2026-07-05)

**Done — phase 3 (localized site/folder data):** a `defineData` entry declares **`localized: true`**;
its site/folder value is stored per locale in `data.<locale>.json` / `folders.<locale>.json`
holding **only the entries that differ from the default** (`data-store.ts` `mergeLocaleSiteData` /
`mergeLocaleFolderData` diff-against-base + prune, so unset entries fall back and an entry reset to
the default drops its override). Read merges the locale override over the base in `buildPageState`
and the export (`readTranslation` folds site + folder overrides in). The editor **splits** the save
by `localized` flag (`editor.ts` `saveBody` → `siteDataI18n` / `folderDataI18n`) and the middleware
routes them to the locale file (or the base when editing the default locale). The Data window marks
localized entries with a globe glyph and a note naming the language being edited. There is **no
separate locale tab** — you edit the language you're viewing the page in (switch it with the
`LocaleSwitcher`).

**Done — phase 1 (core loop) + phase 2 (export & SEO):**
- `locales` plugin option → `normalizeLocales` (`mechanica-shared/locale.ts`: `parseLocalePath`,
  `localePath`, `localeLabel`), threaded through the plugin, dev middleware, entries and SSR bundle.
- `@locale` variant files + translation CRUD, `listPages` grouping, and cascading
  delete/move/duplicate/rename in `pages-store.ts` (`createTranslation`, `deleteTranslation`,
  `translationsOf`, `variantFilesOf`); per-locale `savePage`/`pageVersion`/`setPageDraft`.
- Locale-prefix routing + fallback in `buildPageState` (composes with pagination), `page.locale`/
  `page.locales`/`page.localeFallback` + `state.locales`; `/@mechanica/pages/translation`
  endpoints, locale-aware `/save` + `/state`, and the reserved-slug guard in the middleware.
- Runtime: `context.locales`, `useLocale()`, and `<Link>` auto-prefixing (+ a `locale` prop for
  language switchers). Editor: `LocaleSwitcher.vue` (pill + create-from-default + fallback badge)
  beside `PageBar`, `PagesDialog` coverage badges, saves carry the locale (`editor.ts`).
- Export: locale walk (`readTranslation`), skip-untranslated warnings, hreflang/`x-default` +
  sitemap `xhtml:link` (`seo.ts`), `<html lang>`, `{{ page.locale }}`. `mechanica shot /ru/…`
  works (`shot.ts` resolves the logical path via the state endpoint).
- Tests: `shared/test/locale.test.ts`, seo alternates, `pages-store-i18n.test.ts`,
  `page-state.test.ts` locale cases, export i18n cases, `link.dom`/`use-locale.dom`.
  907 repo tests green; typecheck clean; dist build ok.

**Deferred:**
- **Phase 4** — locale-aware `usePages`/`usePagination` (queries resolve against default-locale
  data, so a translated listing shows default-locale item data), staleness indicator, per-locale
  thumbnails.

**Deviations from the design below:** the "showing default — translate this page" state is
surfaced as an *untranslated* badge + a Create affordance on the `LocaleSwitcher` (not a separate
banner). The `<Link>` locale targeting uses a `locale` prop rather than a distinct component.

## Goal

Let a site publish its pages in multiple languages in a way that stays friendly for both
audiences:

- **Content managers** must not see N copies of every page. One logical page = one row in
  PagesDialog = one canonical path; translations are switched *inside* the editor, not browsed
  as separate pages.
- **Developers** must not change their blocks. Translated props are just props; i18n is a
  concern of the page store, routing, and export — never of block code.

## The model: locale is a dimension of a page, not a separate page

This follows the codebase's two existing precedents:

- **Pagination variants** — `/blog/2` is a virtual URL over one real page: `buildPageState`
  (`packages/mechanica/src/vite/dev/page-state.ts`) maps it to the base page plus context, and
  `page.path` stays the base path so edits save to the real page.
- **Composer breakpoint editing** — "a mode, not a panel": a switcher changes which layer you
  are editing, not which document is open.

Locale gets the same shape: one logical page, sibling variant files on disk, a language
switcher in the editor, and URL-prefix routing that resolves `/ru/about` to the logical page
`/about` in locale `ru`.

**Rejected: folder-per-locale** (`pages/ru/**`). It is exactly the page-list clutter we want to
avoid, and it breaks folder semantics — `folderName` queries, folder-scoped data, and the
BreadcrumbList JSON-LD would all see `ru` as a content folder.

## Storage: sibling files, full copy per locale

```
.mech/pages/about.page.md        # the default locale — unchanged, existing sites are already
                                 # "translated" in their default language
.mech/pages/about@ru.page.md     # the Russian variant — a complete, ordinary PageDoc
.mech/pages/blog/index@de.page.md
```

- **Separator is `@`, not a dot.** Dots are legal in page slugs and `getPagePath` maps URL →
  filename directly (`pages-store.ts`), so `about.ru.page.md` would collide with a real page at
  `/about.ru`. `@` cannot appear in a slug; the parse is unambiguous.
- **Full copy, not a field-level overlay.** The overlay model (shared block tree, per-locale
  text overrides keyed by node id) was considered and rejected for v1: locales genuinely
  diverge (different testimonials, legal blocks, text lengths needing different layouts), and
  overlay merging would touch the codec, save path, undo history, and block reordering all at
  once. A full copy means `parsePage`/`serializePage`/`savePage` are untouched — a translation
  is just another page file. Per-locale `draft` falls out for free (a RU translation can be a
  draft while EN is live), and each language's Markdown stays readable on its own (these files
  are authored by Claude and by hand). The drift cost ("added a block to EN, forgot RU") is the
  standard CMS trade-off (WPML, Storyblok folder-level); a staleness indicator mitigates it
  later (phase 4). A synced/overlay "translation mode" can still be layered on afterwards
  without changing the storage model.
- Per-page `<head>` data (`head.title`, `head.description`) is page-scoped `defineData` living
  *in* the page file — head translation therefore needs **zero extra work**.

## Configuration

Plugin option, next to `siteUrl`:

```ts
mechanica({
  locales: { default: 'en', all: ['en', 'ru', 'de'] },
  // optional labels for the editor UI: { en: 'English', ru: 'Русский' }
})
```

No `locales` option ⇒ everything below is inert; nothing changes for existing sites.

## URLs & dev routing

- Default locale serves **unprefixed** (`/about`); other locales get a path prefix
  (`/ru/about`). (Domain-per-locale strategies are out of scope for v1.)
- `buildPageState` strips a recognized locale prefix **before** the pagination-variant check —
  the same pattern as `paginatedVariantOf` — so the two compose: `/ru/blog/2` ⇒ locale `ru`,
  base `/blog`, pagination page 2.
- State carries `page.locale` (current) and `page.locales` (which translations exist for this
  page). `page.path` stays the **logical** path — links, queries, and saves all speak logical
  paths.
- Editor saves carry the locale (one extra field on the existing JSON wire protocol) so they
  land in the right variant file. `pageVersion` (optimistic concurrency) is naturally
  per-variant-file.
- **Untranslated pages in dev**: fall back to rendering the default-locale document at the
  prefixed URL, with an editor banner ("Showing English — translate this page"), so navigation
  never dead-ends while a content manager works through a site.
- `mechanica shot /ru/about` works for free once routing does (page existence is validated
  against the store; the locale-prefixed URL resolves like any page URL).

## Editor UX

- **PageBar**: a small locale pill (`EN ▾`) next to the page name — the same UX shape as the
  composer's device switcher. Switching locales reuses the in-place page-switch machinery
  (`navigation.switchPage`), so state, on-disk version, and undo history swap per variant. If
  the translation does not exist, the menu item reads **"Create Russian version from English"**
  and performs a `duplicatePage`-style copy into `about@ru.page.md`, pre-filled for
  translation.
- **PagesDialog**: still one row per logical page. A compact locale-coverage column (filled
  badge = translated, hollow = missing); right-click gains "Add / Delete Russian translation".
  `listPages` groups `@locale` siblings under the base item as `locales: string[]` instead of
  listing them as rows.
- **Cascading operations**: delete/rename/move a page ⇒ all sibling variants move with it (the
  confirm dialog says so). `duplicatePage` copies all locale variants — it duplicates the
  logical page.

## Runtime (blocks, links, queries)

Blocks need **no changes** — translated props are just props. Site-specific UI strings
hardcoded in block templates should move to props or (phase 3) localized site data.

- `useLocale()` composable off `MechanicaContext` for locale-conditional rendering, plus a
  `localePath(path, locale?)` helper.
- **Locale-aware link resolution**: `smartLink` values keep storing logical paths; the
  router/link renderer prefixes them for the current locale, so internal links inside RU
  content point at `/ru/...` automatically. SPA navigation preserves the current locale. A
  language-switcher block builds itself from `page.locales` + `localePath`.
- **Queries**: `usePages`/`usePagination` resolve against the current locale — embedded `data`
  hooks read from the variant file; pages missing a translation are excluded (matching export
  behavior). The link validator validates locale-prefixed URLs.

## Data scoping — localized site/folder data (phase 3)

The one real gap in the full-copy model: site- and folder-scoped `defineData` (nav labels,
footer text) lives in `data.json`/`folders.json`, shared across locales. Design reserved now,
shipped after pages work:

- A `defineData` entry may declare `localized: true`; its values are stored in per-locale
  buckets with fallback to the default locale.
- Edited via a locale tab in the editor's Data window.
- `splitDataByScope` / the merge in `buildPageState` and export pick the current locale's
  bucket, falling back to default per-entry.

## Export & SEO

- The export walks **logical pages × existing translations**, rendering each translation to its
  prefixed path (`/ru/about/index.html`) with `state.page.locale` set.
- **Untranslated variants are skipped by default** and reported as warnings (like the link
  validator) — exporting English content at `/ru/...` is an SEO liability.
- `applySeoTags` (`packages/shared/src/seo.ts`) gains an `alternates` option:
  - `<link rel="alternate" hreflang="…">` for each *real* translation, plus `x-default`
    pointing at the default locale;
  - canonical stays per-locale-URL;
  - sitemap entries carry `xhtml:link` alternates.
- `<html lang="…">` set per locale; `{{ page.locale }}` available to the head templating (dev
  and export identical, as always).

## Edge cases & decisions

- Creating a page whose **top-level slug equals a configured locale code** (`/ru`) must be
  rejected — it would be shadowed by prefix routing.
- Prefix stripping happens once, in the state builder / middleware, and applies to
  `pageUrlOf` and file-watching too (an edit to `about@ru.page.md` invalidates the `/ru/about`
  URL).
- A real page file always wins over a virtual interpretation (same rule pagination uses).
- Thumbnails (`mechanica thumbs`) stay per logical page (default locale) in v1.

## Build order

1. **Core loop**: `locales` plugin option; `@locale` variant files + translation CRUD in
   `pages-store.ts`; locale-prefix routing in `buildPageState` (composing with pagination);
   `page.locale`/`page.locales` in state; saves carry locale; PageBar switcher +
   "create from default" action; PagesDialog coverage badges + grouping; cascading
   delete/rename/move; dev fallback rendering + banner. *The whole authoring loop is usable
   after this phase.*
2. **Export & SEO**: locale walk, skip-untranslated warnings, hreflang/x-default alternates,
   sitemap `xhtml:link`, `<html lang>`, `{{ page.locale }}`.
3. **Localized site/folder data**: `localized: true` on `defineData`, per-locale buckets +
   fallback, Data-window locale tab.
4. **Polish**: staleness indicator (variant older than base), locale-aware
   `usePages` refinements, per-locale thumbnails if wanted.

## Touch points (file map)

| Area | Files |
| --- | --- |
| Types (`PageMeta.locale`/`locales`, config) | `packages/shared/src/types.ts` |
| SEO (hreflang, sitemap alternates) | `packages/shared/src/seo.ts` |
| Page store (variant files, CRUD, grouping) | `packages/mechanica/src/vite/dev/pages-store.ts` |
| Routing / state (prefix parse, fallback) | `packages/mechanica/src/vite/dev/page-state.ts`, `middleware.ts`, `src/vite/plugin.ts` |
| Runtime (`useLocale`, link prefixing) | `packages/mechanica/src/core/` (context, router) |
| Editor (switcher, badges, save locale) | `src/editor/components/PageBar.vue`, `src/editor/dialogs/PagesDialog*`, `src/editor/lib/store.ts`, `page-list.ts`, `bridge.ts` |
| Export (locale walk, SEO wiring) | `packages/mechanica/src/cli/` (export, page-assets) |
| Localized data (phase 3) | `packages/mechanica/src/vite/dev/data-store.ts`, `src/editor/dialogs/DataDialog*` |

Remember: Node-side changes (`src/vite/*`, CLI) need `bun run build` + a dev-server restart to
show in a running dev server; only the browser entries are source-aliased in dev-app.
