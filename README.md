# Mechanica

A platform for building Vue 3 websites with a visual block editor. Site authors write Vue SFC "blocks", an in-page editor arranges them into pages, and pages render server-side to a static site.

This is the v2 rewrite, built on **Vite 8 / Vue 3.5 / Vitest 4 / Bun**, English throughout and test-covered. Published packages run on plain Node as well as Bun.

## Docs

- [packages/mechanica/README.md](./packages/mechanica/README.md): the user guide (it's also the npm page), from `npm create mechanica` to an exported site, plus every feature in brief.
- [CHANGELOG.md](./CHANGELOG.md): release notes, including what changed since v1.
- [CONTRACT.md](./CONTRACT.md): the `.page.md` on-disk page format (frontmatter, block fences, `@field` prose regions).
- [PREVIEW.md](./PREVIEW.md): block previews and `mechanica shot`: `previewData` (+ `$slots`), the standalone preview route, and headless block/page screenshots and thumbnails.
- [COMPOSER-MANIFEST.md](./COMPOSER-MANIFEST.md): `defineComposer`, the site's design system as the Block Composer sees it (components, classes, breakpoints).
- [CLAUDE.md](./CLAUDE.md): how the repo works, in depth (architecture, conventions, gotchas).
- [plans/](./plans/): roadmap and design notes for features that are deferred or still evolving.

## Layout

Bun workspaces under `packages/*`:

- **`mechanica`**: the main published package. The `defineBlock` compiler, the runtime, the Vite plugin (dev server + build), the in-browser editor and Block Composer, and the `mechanica` CLI (`build` / `export` / `shot` / `thumbs` / `images` / `push`).
- **`shared`** (`mechanica-shared`, published): DOM-free types, schema helpers, the page-generation and SEO core, and the `.page.md` / `.block.yml` codecs.
- **`create-mechanica`** (published): the `npm create mechanica` scaffolder and its project template.
- **`dev-app`**: the playground site used to exercise everything end to end.

## Commands

```bash
bun install
bun run test          # all package test suites (Vitest)
bun run typecheck     # tsc --noEmit across packages
bun run build         # dist builds of mechanica-shared + mechanica (publishing only)

cd packages/dev-app
bun run dev                 # the editor playground
bun run export              # static SSG → export/
bunx mechanica shot hero    # screenshot a block (see PREVIEW.md)
bunx mechanica thumbs       # page thumbnails for the editor's page browser
```

## Releasing

`mechanica` and `mechanica-shared` share a version; `create-mechanica` has its own, and its template must depend on the published `mechanica` (never `workspace:*`).

1. Bump the versions, then check `bun.lock`: `bun install` doesn't refresh the workspace `"version"` fields after a version-only change, and `bun publish` reads `workspace:*` versions from there. Fix them by hand and confirm with `bun pm pack` that the packed `mechanica` depends on the matching `mechanica-shared`.
2. Publish `packages/shared`, then `packages/mechanica` (both `bun publish`), then `packages/create-mechanica` (`npm publish`).
3. Tag the release commit (`v<version>`) and push the tags.

Stable releases go to npm's `latest` tag. Pass `--tag next` when publishing a prerelease.
