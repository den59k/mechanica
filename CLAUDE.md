# Mechanica

A platform for Vue 3 websites with a visual block editor. Developers write Vue SFC **blocks**, an in-page editor arranges them into pages (`.mech/pages/**.page.md`), and pages are rendered by a static export or by the hosted platform. The platform itself lives in a separate private repo; it never builds sites, it renders the bundle a site uploads.

Docs: [CONTRACT.md](./CONTRACT.md) (the `.page.md` format), [PREVIEW.md](./PREVIEW.md) (previews and `mechanica shot`), [COMPOSER-MANIFEST.md](./COMPOSER-MANIFEST.md).

## Packages

- `mechanica` is the published package. It holds the compiler, runtime (`core/`), Vite plugin, editor and composer, the editor API (`server/`) and the CLI.
- `shared` (`mechanica-shared`) holds DOM-free logic used by the runtime, the server and the platform.
- `dev-app` is the playground. Its `.mech/` holds content the user edits by hand, so leave it alone unless asked.
- `create-mechanica` is the scaffolder. Its template pins *published* versions, and its `AGENTS.md` is the framework guide that ships to users.
- `plugins/mechanica` is a Claude Code plugin; the repo root is its marketplace. The skill must stay thin. After editing it, run `claude plugin validate .` and bump its `version`.

## Working here

- Use Bun only (`bun`, `bunx`). Repo dev runs live from TS source. Published packages ship only the compiled `dist/` and run on plain Node.
- dev-app aliases only the browser entries (runtime, editor, composer) to source. The plugin, middleware, CLI and the browser's copy of `mechanica-shared` come from `dist/`, so a change there needs `bun run build` and a dev-server restart.
- Check: `bun run --filter mechanica test` and `bun run --filter mechanica typecheck`; both must pass. `tsc` skips `.vue` files, so boot the dev server too (`cd packages/dev-app && bun run dev`).
- After changing a block's look, run `mechanica shot <blockId>`; after editing a page, run `mechanica shot </path>`. Read the PNG before calling the work done. Every block needs realistic `previewData`, because previews, shots and thumbnails render it.

## Invariants

- **`defineBlock` is the only macro.** It is rewritten at the source level before `@vitejs/plugin-vue` runs. Never hook plugin-vue's internal requests; v1 did, and that pinned it to Vite 5.
- **Mode lives in the runtime context** (`client | server | dev`), never in `import.meta.env`.
- **The production client hydrates the export.** Server and client must render identically, so touch `window` and `document` only in `onMounted`. Dev never hydrates; use `MECHANICA_HYDRATION_DEBUG=1 mechanica build` to see mismatches.
- **Prop defaults are baked into the state, never applied at render time.** Every process that fills them must call `registerFieldSchemas`.
- **Bundle boundaries:**
  - `shared` stays DOM-free.
  - YAML codecs (`page-format`, `block-format`) are subpath exports, kept out of the barrel the client imports.
  - The browser entries build together so they share one runtime instance.
  - `src/server/` (`mechanica/server`) and `mechanica/export` never import Vite.
- **Stores are host-agnostic:**
  - Text content goes through `ContentFiles`, never `node:fs`. Store configuration hangs off that object, never module globals, because one process may serve many sites.
  - Uploads go through `AssetStore`. A file is referenced as `/media/<name>`, where the name carries a content hash and never changes.
  - Parse those references with `uploadNameOf`.
  - After `buildPageState`, call `fillStateImages`.
  - Review comments go through `CommentStore` (by default `.mech/comments/`, which gitignores itself), never through `ContentFiles` or a page file: they are workflow state, not content. `mechanica comments` (list, `reply`, `resolve --note`) is how an agent reads and answers them. A project linked to the platform keeps its comments there: the dev server and the CLI both take their store from `commentStoreFor` (`cli/platform/comments.ts`), and `--local` forces the file. When the platform of a linked project does not answer, that store rejects and asks again next time; it never falls back to the file. The editor re-reads threads on a timer, since such a host sends no change events.
- **The editor reaches its host only through `editor/lib/backend.ts`.** A new route needs three parts: a protocol type in `shared`, a method in `backend.ts`, and a branch in `server/service.ts`. The editor store clones `window.state`; sharing references with the runtime caused typing flicker.
- **Composed blocks are data** (`.mech/blocks/*.block.yml`) expanded at render time. Every element setting is an inline `--el-*` CSS variable that media queries choose between; a direct inline style would beat those media queries.
- **i18n.** `page.path` is always the logical path, with no locale prefix. A translation file only overlays the base page: the base owns which blocks exist and their order.
- **The platform repo mirrors three things:** `cli/platform/bundle-format.ts`, the uploads API and the comments API (`cli/platform/comments.ts`). Change both sides together.

## Editor style

Sass, light theme only, calm UI, black pill primary buttons. Tokens are `--mech-*` (`styles/_variables.scss`), and component styles are scoped in the component. To add an icon, drop an SVG into `editor/icons/` and render it with `<VIcon name="…">`. `vuesix` and `vuewrite` are the user's own libraries.

## Releasing

`bun run release:bump <v>` → `bun run release:check` → push the tag `v<v>`. The tag triggers `publish.yml`, which uses npm trusted publishing; don't rename that file.

Never run `npm publish` on `shared` or `mechanica`: it ships `workspace:*` verbatim. If the check reports a stale `mechanica-shared` pin, hand-edit the workspace versions in `bun.lock`.

## Elsewhere

The sibling `mechanics` repo is the legacy v1: use it for reference, never edit it.
