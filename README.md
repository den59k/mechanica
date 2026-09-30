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

## AI agent skill

`plugins/mechanica` is a Claude Code plugin with one skill, `create-mechanica-site`: it sets up a new Mechanica site (runtime check, scaffold, install, dev server) and hands over to the scaffolded project's `AGENTS.md`. The repository is its marketplace (`.claude-plugin/marketplace.json`):

```bash
claude plugin marketplace add den59k/mechanica
claude plugin install mechanica@mechanica
```

The same `SKILL.md` works in Codex: save it as `~/.agents/skills/create-mechanica-site/SKILL.md`.

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

1. `bun run release:bump <version>` sets the version of `mechanica` and `mechanica-shared`, in their `package.json` and in `bun.lock` (`bun install` doesn't refresh the lockfile's workspace versions after a version-only change, and packing reads `workspace:*` versions from there). Add `--create <version>` when the scaffolder or its template changed: it also bumps `create-mechanica` and points the template at the new `mechanica`. Then add the CHANGELOG entry.
2. Run `bun run release:check`. It builds, packs the three packages the way `bun publish` would and verifies the tarballs: no leftover `workspace:*`, `mechanica` depending on the matching `mechanica-shared`, and which versions are not on npm yet.
3. Commit, tag the commit `v<version>` (the `mechanica` version) and push the tag. The [Publish workflow](./.github/workflows/publish.yml) runs the tests and the release check, publishes the versions that aren't on npm yet (`mechanica-shared`, `mechanica`, `create-mechanica`, in that order), then installs the result from the registry and exports a site with it.

The workflow authenticates with npm trusted publishing (OIDC), so there is no token to store: on npmjs.com each package lists this repository and `publish.yml` as its trusted publisher. Running the workflow by hand (Actions → Publish → Run workflow) is a rehearsal that uploads nothing.

To publish by hand instead: `bun publish` in `packages/shared`, then in `packages/mechanica` (`npm publish` would ship `workspace:*` as is, and `mechanica` refuses it), then `npm publish` in `packages/create-mechanica`.

Stable releases go to npm's `latest` tag and prereleases (a version with a `-`) to `next`; by hand, pass `--tag next` for a prerelease.
