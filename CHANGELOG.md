# Changelog

## 2.0.0 (2026-09-30)

The first stable release of Mechanica 2, a ground-up rewrite of 1.x. Released packages: `mechanica` 2.0.0, `mechanica-shared` 2.0.0 and `create-mechanica` 0.3.0.

### Since 2.0.0-alpha.14

- **Fixed:** the dev server never registered Mechanica's field types. Shorthand props like `photo: 'image'` or `cta: 'smartLink'` therefore defaulted to `''` in development (the export was right), and images in them bypassed the image manifest: their blur-up previews were written into `.page.md` files on save instead of `.mech/images.json`, and dimensions weren't injected in dev.
- Builds on Vite 8.3+ no longer print rolldown's warning about the blocks chunk group missing a `debugName`.
- Published to npm's `latest` tag, so `npm install mechanica` and `npm create mechanica@latest` now get 2.x.

### What's new since 1.x

- **A current toolchain.** Vite 8 (Rolldown), `@vitejs/plugin-vue` 6 and Vue 3.5, with real peer ranges instead of `*`. The packages ship compiled JavaScript with type declarations and run on Node.js 20.19+/22.12+ or Bun.
- **A sturdier block compiler.** `defineBlock` is rewritten in the source before `@vitejs/plugin-vue` compiles the file. 1.x patched plugin-vue's internal request URLs and re-parsed its compiled output, which tied it to Vite 5. The production client build also strips editor-only metadata (schemas, preview data) from blocks.
- **One app entry.** `src/main.ts` exports `defineMechanicaApp({ root })`, and the plugin generates the client and server entries from it. The dev server builds each page's state itself instead of waiting for the editor to push it, so pages render the same in development and in the export.
- **Pages are Markdown files.** `.mech/pages/**.page.md` replaces per-page JSON: YAML frontmatter, one fence per block, and rich text stored as plain Markdown. The files are pleasant to edit by hand or with an AI assistant. Hand edits sync into the running editor, and the editor won't overwrite a file that changed underneath it.
- **A rebuilt editor, now in English**, with undo/redo, drag and drop in the page and in the block tree (including into slots), copy/cut/paste, context menus, palette previews and thumbnails, a page browser with folders, a Ctrl+K page switcher, rename/duplicate/delete for pages, drafts, and links you can follow in place.
- **Shared data that's actually shared.** A `defineData` value can be set site-wide, per folder or per page, stored in `.mech/data.json`, `.mech/folders.json` and the page file. In 1.x, local development only kept page values.
- **Rich text** built on vuewrite: WYSIWYG with a Markdown view, built-in image, code, callout and table widgets, your own widgets via `defineWidget` (`mechanica/widgets`), block and table context menus, and shortcuts for non-breaking spaces and hyphens.
- **The Block Composer**: build blocks visually with auto layout, per-breakpoint styles, bindings to props, repeated items, links and background images. Composed blocks are data (`.mech/blocks/*.block.yml`) and render, preview and export like code blocks. `defineComposer` (`src/composer.ts`) exposes your components, CSS classes and breakpoints to it.
- **Layouts and whole-page blocks.** Named layouts chosen per page (`layout:` frontmatter or the Page setup pane), `standalone` blocks for pages like a 404, and "Design this page" for one-off page designs in the composer.
- **Multi-language pages** via the plugin's `locales` option. Translations are sibling files (`about@de.page.md`) that store only what differs from the default language; `localized` shared data, per-language queries, `useLocale()` and locale-aware `<Link>`.
- **Images**: the `<Image>` component (dimensions, lazy loading, blur-up previews), focal points and non-destructive crops, and `mechanica images` for headless image metadata.
- **Queries and pagination**: `usePages`, `usePagination` (every page of results exports as a real page) and `useFetch`, all resolved at build time and baked into the output.
- **Generated pages**: the plugin's `generatePages` option renders routes from any data source without a page file each.
- **SEO at export**: canonical and `og:url` tags, absolute social-image URLs, `sitemap.xml`, `robots.txt`, `hreflang`, WebSite and BreadcrumbList JSON-LD, `noindex`, and warnings for missing titles, descriptions, `<h1>` and `alt` text, duplicate titles and broken internal links. A `/404` page is also written as `404.html`.
- **Faster pages**: blocks are code-split from the app (one shared chunk by default, `chunk` to split heavy blocks) and each exported page preloads exactly the blocks it uses. `--assets-url` serves assets from a CDN.
- **Visual checks from the terminal**: `mechanica shot` screenshots a block or a page and `mechanica thumbs` refreshes the editor's thumbnails, using a locally installed Chrome or Edge.
- **`npm create mechanica`** scaffolds a working site with a `CLAUDE.md` for AI assistants.
- **Tests**: over 1,000 unit and DOM tests; 1.x had none.

### Breaking changes from 1.x

There is no automatic migration: 1.x projects are ported by hand. 1.x remains installable as `mechanica@1`.

- Vite 8 and `@vitejs/plugin-vue` 6 are required.
- `src/main.ts` exports `defineMechanicaApp({ root: App })` instead of calling `createSSRApp(App).use(createMechanica()).mount('#app')`, and `index.html` no longer loads it with a `<script>` tag.
- The plugin is a named import, `import { mechanica } from 'mechanica/plugin'`. Its `entrySsr` option is now `entry`; `variables` and `pages` are gone.
- `defineBlock`: `group` is now `category`, a field's label is `label` (was `name`), and `multiline: true` gives way to the `text` field type. Block ids default to the kebab-cased file name (`Headline.vue` → `headline`); set `id` to keep an old one.
- `defineData` no longer takes `order`.
- Pages are `.page.md` files, and `.mech/pages/**.json` pages are ignored. Uploaded files in `.mech/assets/` keep working. Languages come from the plugin's `locales` option instead of `.mech/config.json`.
- `RouterLink` and `SmartLink` are replaced by `<Link>`, whose active class is now `is-active` (was `router-link-active`). `useQuery` is replaced by `usePages`, `usePagination` and `useFetch`. The `cn` and `pick` helpers and the `mechanica/updater` and `mechanica/editor-dev` entry points are removed.
- `{{ }}` placeholders in `index.html` are HTML-escaped; `{{{ }}}` emits raw JSON for JSON-LD scripts.
- `mechanica export` builds the site itself. Uploads are exported to `/media/` (was `/mech-assets/`), and the `--base`, `--assets-dir` and `--uploads-dir` flags are removed: sites export for the root of a domain, and `--assets-url` points assets at a CDN.
- Rich-text links are stored as `{ href }` (was `{ url, blank }`) and inline images as `{ type: 'img', src }`.
- `mechanica push` takes `--dir` (was `--folder`) and no longer reads `.env`. The server-rendering contract changed, so bundles pushed to the 1.x hosting backend won't render there.

### Known limitations

- `file` fields have no editor yet (1.x had an upload control); they fall back to a plain text input.
- The rich-text toolbar has no link button. Write links as `[text](url)` in its Markdown view.
- Sites can't be exported to a sub-path such as `https://example.com/docs/`.
- `mechanica shot` and `mechanica thumbs` need Node.js 22+ or Bun, for the built-in WebSocket client.
- `mechanica push` is experimental: the hosting backend's contract isn't final.

### The alpha series

2.0.0 stabilizes fifteen alphas (alpha.0 to alpha.14) published under npm's `next` tag.

- **alpha.0–2** (July 3): the first public preview. The block compiler, runtime, dev server and editor; `.page.md` pages; rich text and widgets; block previews, `shot` and `thumbs`; the code-split client build; the query engine; `create-mechanica` 0.1.
- **alpha.3–4** (July 6): page drafts, SEO at export, the `<Image>` component with blur-up previews and cropping, the Block Composer and its `defineComposer` manifest, and multi-language pages.
- **alpha.5–10** (July 7): generated pages, CDN assets (`assetsUrl` / `--assets-url`), non-breaking space and hyphen shortcuts in text fields and rich text, and a lighter starter template (plain CSS, no Sass).
- **alpha.11–12** (July 13): layouts and standalone page blocks (standalone composed blocks too), and tarballs that ship compiled `dist/` only, so Bun installs run the same code as Node.
- **alpha.13** (July 21): client-side navigation scrolls to the top, or to the `#hash` target.
- **alpha.14** (July 24): collapsing the editor panels makes the page fully interactive; `defineData({ folder })` limits an entry to one folder's pages.
