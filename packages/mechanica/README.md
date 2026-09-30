# mechanica

Build Vue 3 websites with a visual block editor. You write **blocks** — ordinary Vue single-file components with a typed props schema — and arrange them into **pages** in an editor that runs on top of your live site. Pages are stored as readable Markdown files in your project, and `mechanica export` renders every page to static HTML.

- **Blocks are just Vue.** One compile-time macro, `defineBlock`, declares a block's props; everything else is plain Vue 3.
- **The editor is your site.** In development the editor overlays the real page: add blocks from a palette, edit props in forms, drag to reorder, undo/redo, manage pages.
- **Pages are files.** `.mech/pages/about.page.md` is Markdown with YAML props — editable in the editor, by hand, or by an AI assistant, with clean git diffs.
- **Static output, SEO included.** Per-page HTML and code splitting, sitemap, canonical URLs, hreflang and JSON-LD.

Built on Vite 8 and Vue 3.5. Runs on Node.js 20.19+ or 22.12+ (npm, pnpm, yarn) or [Bun](https://bun.sh).

## Quick start

```bash
npm create mechanica@latest my-site
cd my-site
npm install
npm run dev
```

Open the URL Vite prints (`http://127.0.0.1:5173/`). The starter page appears with the editor on top of it: click a block to edit its props, add blocks from the palette, and open the page browser to create more pages. Every edit is saved into `.mech/` as you go.

When you're ready to ship:

```bash
npm run export
```

`export/` now holds a static site: an `index.html` per page, hashed JS and CSS in `assets/`, your uploads in `media/`. It's built to be served from the root of a domain; upload it to any static host, or look at it locally with `npx vite preview --outDir export`.

Prefer Bun? `bun create mechanica my-site`, then `bun install` and `bun run dev`.

### With an AI coding agent

Claude Code, Codex and similar agents can set the site up and build it for you. Open an empty folder in the agent and paste:

```text
Create a Mechanica site in this folder.

1. Check for Node.js 20.19+ (`node -v`) or Bun (`bun -v`). If neither is
   installed, ask me before installing Bun from https://bun.sh.
2. Run `npm create mechanica@latest .` (or `bun create mechanica .`), install
   the dependencies, and start the dev server in the background.
3. Read AGENTS.md in the project and follow it for everything else.

Then build: <describe your site>
```

To skip the pasting, install the skill once. It does the same setup and also handles a machine with no Node.js.

Claude Code:

```bash
claude plugin marketplace add den59k/mechanica
claude plugin install mechanica@mechanica
```

Codex: save [SKILL.md](https://github.com/den59k/mechanica/blob/main/plugins/mechanica/skills/create-mechanica-site/SKILL.md) as `~/.agents/skills/create-mechanica-site/SKILL.md`.

Then ask the agent to create a Mechanica site.

The starter's `AGENTS.md` teaches the agent how to write blocks and pages and how to check its work with screenshots, and points it at the documentation of the installed version. Run the agent on your own machine: the editor opens in your browser from the local dev server.

## A Mechanica project

```text
index.html            the document shell; {{ }} placeholders fill <head> per page
vite.config.ts        plugins: [mechanica(), vue()]
src/main.ts           export default defineMechanicaApp({ root: App })
src/App.vue           site-wide chrome around <Content />
src/blocks/*.vue      blocks: every file appears in the editor's palette
src/data/*.ts         shared data entries (defineData)
src/composer.ts       optional: your design system for the Block Composer
.mech/pages/          the pages, one .page.md file each
.mech/assets/         uploaded files
.mech/data.json       site-wide data values
```

`.mech/` is content — commit it. Scaffolded projects also include an `AGENTS.md` that teaches AI coding assistants (Claude Code, Codex and others) to author blocks and pages in this format.

### Adding Mechanica to an existing Vite + Vue project

```bash
npm install mechanica vue
npm install -D vite @vitejs/plugin-vue
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mechanica } from 'mechanica/plugin'

export default defineConfig({
  plugins: [mechanica(), vue()],
})
```

```ts
// src/main.ts — export an app definition; don't call createApp()/mount() yourself
import { defineMechanicaApp } from 'mechanica'
import App from './App.vue'

export default defineMechanicaApp({ root: App })
```

```vue
<!-- src/App.vue -->
<template>
  <Content />
</template>

<script setup lang="ts">
import { Content } from 'mechanica'
</script>
```

`index.html` needs only a mount point, `<div id="app"></div>`. Leave out the usual `<script type="module" src="/src/main.ts">`: the plugin injects the entry (and, in dev, the editor) itself.

## Blocks

A block is a `.vue` file in `src/blocks/`. Its `<script setup>` calls the global `defineBlock` macro (no import needed), which declares the editable props and returns them typed:

```vue
<!-- src/blocks/Hero.vue -->
<template>
  <section class="hero">
    <h1>{{ props.title }}</h1>
    <p v-if="props.subtitle">{{ props.subtitle }}</p>
    <Image :image="props.photo" eager />
    <Link v-if="props.cta?.url" :to="props.cta">{{ props.cta.title || 'Read more' }}</Link>
  </section>
</template>

<script setup lang="ts">
import { Image, Link } from 'mechanica'

const props = defineBlock({
  name: 'Hero',
  category: 'Content',
  props: {
    title: { type: 'string', label: 'Headline', default: 'Hello' },
    subtitle: 'text',
    photo: 'image',
    cta: 'smartLink',
  },
  // Example values for the palette preview and `mechanica shot`
  previewData: { title: 'Build sites visually', subtitle: 'Blocks are plain Vue components.' },
})
</script>
```

The block's id is its kebab-cased file name (`Hero.vue` → `hero`). Props use [compact-json-schema](https://www.npmjs.com/package/compact-json-schema): the JSON types (`string`, `number`, `boolean`, `object`, `array`) plus Mechanica's field types `text`, `richText`, `image`, `color`, `smartLink` and `multiselect`. The object form takes `default`, `label`, `description`, `placeholder` and `enum` (rendered as a select).

Other `defineBlock` options: `icon`, `description` and `order` for the palette; `hidden` and `devOnly`; `standalone`, `folders` and `layouts` to control where the palette offers the block; `chunk` for code splitting; `slots` for named slots. A block whose template contains `<slot />` becomes a container, and other blocks nest inside it in the editor.

Give every block meaningful `previewData`: it drives the palette's hover preview, the standalone preview route and `mechanica shot`. A `$slots` key fills slots with child blocks, e.g. `$slots: { default: [{ blockId: 'card', data: { title: 'One' } }] }`.

## Pages

Each page is a `.page.md` file under `.mech/pages/`, and its path is the URL: `about.page.md` → `/about`, `blog/index.page.md` → `/blog`, `index.page.md` → `/`.

```markdown
---
name: About
data:
  head:
    title: About us
---

::: hero
title: About us
cta: { url: /contacts, title: Write to us }
@subtitle
We build fast websites
for people who care about the details.
:::

::: columns
gap: lg
::: card slot=left
title: Fast
:::
::: card slot=right
title: Readable
:::
::: /columns
```

- The YAML frontmatter holds the editor label (`name`), page-scoped data (`data`) and optional `layout`, `draft: true` (hidden from listings and the export) and `meta` (`noindex: true`, `lastmod`).
- Each block is a fence: `::: <blockId>`, then its props as YAML, then `@field` regions for long text, then any child blocks, closed by `:::`. Keep that order: once a region has started, a `key: value` line is part of its text.
- A region runs until the next `@field`, child block or `:::`, and is taken as written, blank lines and Markdown included. It fills a `text` prop with that text, and a `richText` prop with its Markdown turned into rich text.
- Blocks nest by placing fences inside a container's fence, and `slot=<name>` puts a child into a named slot (a container's children go either all to the default slot or all to named ones). Nothing is indented: every `:::` and `@field` starts at the beginning of its line, and a block is a child of whichever fence is still open. A container may close with `::: /<blockId>`, which reports a missing `:::` at the line where the fences stop pairing up.
- Props are YAML, so quote a value that starts with `#` or contains `: `, as in `href: "#pricing"`. Inside a region nothing needs quoting; only a line that starts with `:::`, or consists of just `@name`, takes a leading backslash (`\:::`), and not even that inside a code fence.
- An `image` prop points at an uploaded file: `photo: { src: /@mechanica/assets/team.jpg, alt: "Our team" }`.
- Props left out take their schema defaults, so a hand-written page renders exactly like one made in the editor.

With `npm run dev` running, edits you make to these files show up in the editor live, and the editor won't overwrite a file that changed on disk underneath it.

## Shared data and `<head>`

Data that isn't a block prop (a site header, page titles, a post date) is declared with `defineData`, an ordinary imported function that returns a hook:

```ts
// src/data/head.ts
import { defineData } from 'mechanica'

export const useHead = defineData({
  id: 'head',
  title: 'Page head',
  props: {
    title: { type: 'string', default: 'My site' },
    description: 'string',
  },
})
```

Call `useHead()` in any component to read the values. An entry registers when its module is imported, usually by the block or component that uses it. Data that only `index.html` reads, like `head`, still needs importing somewhere (the starter's `App.vue` imports `./data/head`): unregistered entries are left out of the Page data window, page state and `{{ }}` placeholders.

Values are edited in the editor's **Page data** window, where each entry can be set for one page, for a folder of pages, or site-wide; a page value overrides its folder's, which overrides the site's. They're stored in the page file, `.mech/folders.json` and `.mech/data.json` respectively. Pass `folder: 'blog'` to offer an entry only on pages under that folder, and `localized: true` to translate its site/folder value per language.

`index.html` is templated with the same data, in dev and in the export:

```html
<title>{{ head.title }}</title>
<meta name="description" content="{{ head.description }}" />
```

`{{ page.path }}`, `{{ site.url }}` and `{{ site.name }}` are available too, and the triple-brace form `{{{ expr }}}` emits raw JSON for `<script type="application/ld+json">` blocks.

## Layouts and whole-page blocks

Give pages different shells by declaring named layouts. Each layout component renders `<Content />` inside its own chrome, and the root renders `<Layout />`:

```ts
// src/main.ts
export default defineMechanicaApp({
  root: App, // its template: <Layout />
  layouts: { site: SiteLayout, bare: BareLayout }, // the first entry is the default
})
```

A page picks its layout with `layout: bare` in its frontmatter, or in the editor's **Page setup** pane. Pages without one get the first layout, and `useLayout().name` tells a component which layout is active.

Blocks with `standalone: true` are whole pages in one block, such as a 404 or a contact form. The palette offers them only on empty pages ("Start this page"), so they don't clutter it elsewhere.

## Images

Render an `image` prop with the `<Image>` component. It outputs `alt`, intrinsic `width`/`height` (no layout shift), native lazy loading, and a blurred inline preview until the real image arrives. Add `eager` to above-the-fold images.

The editor captures dimensions and the blur-up preview on upload. For images added by hand, `mechanica images` generates them headlessly; it needs `sharp` in your project (`npm install -D sharp`), and the export fills in anything missing when `sharp` is installed.

Editors can set a focal point and crop from the image field's **Position / Crop** action. Cropping is opt-in per field, via `crop: { width: 1200, height: 630 }` (fixed output size), `crop: { aspect: 16 / 9 }` or `crop: true` (free) on its schema. Crops are non-destructive: the original stays, and a derived file is rendered in its place. For images painted as a CSS background, `imagePosition(image)` turns the focal point into a `background-position` value.

## Links and navigation

`<Link :to="…">` takes a path string or a `smartLink` value. Internal links navigate client-side without a full reload, get an `is-active` class on the current page, and add the language prefix on multi-language sites. `useRouter().push(path)` navigates from code, and `useRoute().path` is the current path.

## Listing pages and pagination

Blocks can query the site's pages. Queries run at build time and their results are baked into the page, so there's no runtime API to host:

```ts
import { usePages, usePagination } from 'mechanica'
import { usePostMeta } from '../data/post-meta' // defineData({ id: 'postMeta', props: { date: 'string' } })

const latest = usePages({ folderName: 'blog', data: [usePostMeta], sort: { by: 'postMeta.date', dir: 'desc' }, limit: 3 })

const blog = usePagination({ folderName: 'blog', data: [usePostMeta], pageSize: 10 })
// blog.items, blog.page, blog.pageCount, blog.prevPath, blog.nextPath, blog.pathFor(n)
```

A paginated page exports as real pages, `/blog`, `/blog/2` and so on, each with its own slice. `useFetch({ url })` fetches external JSON the same way: on the server, baked into the output.

## Generated pages

To produce many pages from an external source (a product catalog, API docs) without a `.page.md` file each, give the plugin page providers:

```ts
// vite.config.ts
import { mechanica, type PageProvider } from 'mechanica/plugin'

const products: PageProvider = async () => {
  const items = await fetch('https://api.example.com/products').then((res) => res.json())
  return items.map((item) => ({
    path: `/shop/${item.slug}`,
    content: [{ id: item.slug, blockId: 'product', data: { title: item.title } }],
    data: { head: { title: item.title } },
  }))
}

// plugins: [mechanica({ generatePages: [products] }), vue()]
```

Providers run when the dev server starts and at build. Generated pages render through the normal pipeline, appear in the sitemap and are read-only in the editor.

## Multi-language sites

```ts
mechanica({ locales: ['en', 'de'] }) // the first locale is the default
```

The default language is served at unprefixed URLs, the others under `/de/…`. A translation is a sibling file, `about@de.page.md`, created from the editor's language switcher. It stores only the fields that differ, so images, links and anything else left untranslated keep following the default-language page.

`<Link>` keeps visitors in their language automatically. For a language switcher, `useLocale()` returns `locale`, `locales` and `localePath()`, and `<Link :to="path" :locale="code">` targets a specific language. The export writes each translation to its own URL (pages without a translation are skipped for that language), and with `siteUrl` set it adds `hreflang` alternates to the page head and the sitemap.

## Rich text and widgets

A `richText` prop is edited with a WYSIWYG editor for headings, lists, bold/italic/underline, images, code, callouts and tables. It switches to a Markdown view, where you can also write links as `[text](url)`, and it's stored as Markdown inside the page file. Its value is a [vuewrite](https://www.npmjs.com/package/vuewrite) document; render it with vuewrite's `TextViewer`, as the starter's `RichTextView.vue` does.

You can add your own content widgets to the editor's Insert menu: put a module in `src/widgets/` that default-exports `defineWidget({ type, title, icon, create, editor })` from `mechanica/widgets`, then render the widget through a `#<type>` slot on your `TextViewer`.

## Block Composer

Designers can build new blocks without code. The palette's **New block** button opens the composer: frames with auto layout, text, images and your own components, per-breakpoint styles, and repeated items. Any value can be bound to a prop, so each placed copy stays editable. Composed blocks are saved as `.mech/blocks/<id>.block.yml`, appear in the palette under "Site blocks", and render, preview and export like any other block.

`src/composer.ts` hands the composer your design system:

```ts
import { defineComposer } from 'mechanica'
import UiButton from './components/UiButton.vue'

export default defineComposer({
  components: {
    button: { component: UiButton, name: 'Button', props: { label: { type: 'string', default: 'Button' } } },
  },
  classes: { container: { title: 'Container', on: 'frame' } }, // your CSS classes, offered as element styles
  breakpoints: { md: 1024, sm: 640 },
})
```

## SEO

Set `siteUrl` on the plugin, or pass `--site-url` to `mechanica export`, and the export adds what nobody should write by hand: canonical and `og:url` tags, absolute social-image URLs, `rel=prev/next` on paginated pages, BreadcrumbList JSON-LD from the folder structure, `sitemap.xml` and `robots.txt` (a `public/robots.txt` of your own takes precedence). Add `siteName` for WebSite JSON-LD on the home page. Tags already in your `index.html` are never duplicated. `meta: { noindex: true }` in a page's frontmatter keeps it out of search engines and the sitemap.

Every export also warns about missing titles and descriptions, pages without exactly one `<h1>`, images without `alt`, duplicate titles, and internal links to pages that don't exist. A page at `/404` is also written as `404.html`, which most static hosts serve for unknown URLs.

## Code splitting

By default all blocks share one `blocks` chunk, cached across pages. Mark heavy, rarely used blocks with `chunk: 'charts'` in `defineBlock` to split them into their own chunk, or set the plugin's `blockChunks: 'per-block'`. The export adds per-page `<link rel="modulepreload">` and stylesheet tags, so each page loads exactly the block code it uses.

## Checking your work visually

```bash
npx mechanica shot hero                     # screenshot one block, from its previewData
npx mechanica shot /about --width 1440,390  # a whole page, at two widths
npx mechanica thumbs                        # page thumbnails for the editor's page browser
npx mechanica thumbs --blocks               # block thumbnails for the palette
```

These drive a locally installed Chrome or Edge (or `--browser <path>`) and need Node.js 22+ or Bun. They reuse a dev server running on port 5173 and start one if there isn't. Screenshots go to `.mech/shots/`, which is handy for reviewing a block or letting an AI assistant check its own work.

## CLI

| Command | What it does |
| --- | --- |
| `mechanica export` | Build, then render every page to static HTML in `export/`. Flags: `--site-url`, `--site-name`, `--assets-url` (serve `/assets` and `/media` from a CDN) |
| `mechanica build` | Build the client and server bundles into `dist/` (`export` runs this for you) |
| `mechanica shot <blockId \| /path>` | Screenshot a block or a page. Flags: `--width`, `--data`, `--out`, `--full`, `--server`, `--browser` |
| `mechanica thumbs [--blocks]` | Regenerate page or block thumbnails for the editor |
| `mechanica images` | Generate image dimensions and blur-up previews for `.mech/assets` (needs `sharp`; `--force` redoes all) |
| `mechanica push` | Experimental: upload `dist/` to a Mechanica hosting backend |

## Plugin options

`mechanica(options)` from `mechanica/plugin`; every option is optional.

| Option | Default | |
| --- | --- | --- |
| `siteUrl`, `siteName` | none | Public origin and name: `{{ site.* }}` templating and SEO output at export |
| `locales` | none | `['en', 'de']` or `{ default, all, labels }` turns on multi-language pages |
| `generatePages` | none | Page providers (see above) |
| `blockChunks` | `'bundled'` | `'per-block'` gives each block its own chunk |
| `assetsUrl` | none | CDN origin for exported assets. Set Vite's `base` to the same URL |
| `entry` | `'src/main.ts'` | Module exporting `defineMechanicaApp(…)` |
| `mount` | `'#app'` | Mount selector |
| `blocksDir` | `'src/blocks'` | Where blocks are collected from |
| `widgetsDir` | `'src/widgets'` | Where rich-text widgets are collected from |
| `composerFile` | `'src/composer.ts'` | The Block Composer manifest |
| `mechDir` | `'.mech'` | Content directory |

## API

From `mechanica`:

- **App and data:** `defineMechanicaApp`, `defineData`, `defineComposer`
- **Components:** `<Content>`, `<Layout>`, `<Link>`, `<Image>`
- **Composables:** `usePages`, `usePagination`, `useFetch`, `useLocale`, `useLayout`, `usePageData` (the current page's path, `meta`, layout and locale), `useRouter`, `useRoute`
- **Helpers:** `imagePosition`

From `mechanica/plugin`: `mechanica` and the `PageProvider` type. From `mechanica/widgets`: `defineWidget` and `useWidgetServices` (uploads and the image picker inside widget editors). `mechanica/editor` and `mechanica/composer` are loaded by the plugin in development; you don't import them.

## Upgrading from 1.x

Mechanica 2 is a rewrite, and a 1.x project has to be ported by hand; there is no automatic migration. What changes:

- Vite 8 and `@vitejs/plugin-vue` 6 are required.
- `src/main.ts` exports `defineMechanicaApp({ root: App })` instead of calling `createSSRApp(App).use(createMechanica()).mount('#app')`, and `index.html` no longer loads it with a `<script>` tag.
- The plugin is a named import, `import { mechanica } from 'mechanica/plugin'`, and its `entrySsr` option is now `entry`.
- In `defineBlock`, `group` is now `category` and a field's label is `label` (it was `name`). Block ids default to the kebab-cased file name (`Headline.vue` → `headline`); set `id` to keep an old one.
- Pages are `.page.md` files instead of `.mech/pages/**.json`, and JSON pages are ignored. Uploaded files in `.mech/assets/` keep working.
- `RouterLink` and `SmartLink` are replaced by `<Link>` (whose active class is now `is-active`), and `useQuery` by `usePages`, `usePagination` and `useFetch`.
- `{{ }}` placeholders in `index.html` are now HTML-escaped.

1.x remains installable as `mechanica@1`.

## License

MIT
