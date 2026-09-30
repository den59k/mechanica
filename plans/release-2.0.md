# Task: ship Mechanica 2.0.0 stable

Prepare the monorepo for the first **stable** 2.x release of the three published packages —
`mechanica`, `mechanica-shared`, `create-mechanica` — and take it all the way to
"ready to run `publish`". Do everything except the publish itself: pack the tarballs, verify
them from a consumer's point of view, commit, and hand the user a short publish sequence.
Publishing is the user's call; if they explicitly tell you to publish, do it in the order below.

You decide how to split and verify the work. Everything in this file is context and a
checklist of what is known to be missing, not a rigid script. CLAUDE.md is authoritative for
how the repo works — read it first.

## What is already verified (2026-09-30, don't redo unless something changes)

- `bun run test` (all packages), `bun run typecheck`, `bun run build` are green on the current
  tree; `bun pm pack --dry-run` for all three packages ships the right files (`dist/` + `bin/`
  only, no `src`).
- Consumer end-to-end under **plain Node 24 + npm** works: `create-mechanica` scaffold →
  install the packed tarballs → `npm run export` renders the page with per-page block
  `<link>` tags → `vite` dev server boots and the `/@mechanica/*` endpoints respond.
- The root `package.json` **no longer pins vue** (the old `overrides.vue: 3.5.38` was removed).
  The "vue ≥3.5.39 breaks the rich-text editor" belief was wrong: it was two copies of Vue from
  a stale Bun isolated-install symlink. Do **not** reintroduce a pin anywhere (root, template,
  peer range). If you ever see "Missing ref owner context / hoisted vnodes" warnings, check
  for duplicate vue copies (`readlink -f packages/mechanica/node_modules/vuewrite/../vue`) and
  do a clean reinstall before blaming a dependency.
- Known Bun trap (see the project memory): after a manual version bump, `bun pm pack` /
  `bun publish` can bake the **old** version into `workspace:*` deps unless `bun.lock` is
  refreshed. Check the packed `package.json` of `mechanica` — its `mechanica-shared` dep must
  equal the version you are releasing.

## Release checklist (what is known to be missing)

Versions & npm plumbing
- Bump `mechanica` and `mechanica-shared` from `2.0.0-alpha.14` to `2.0.0`; keep them in
  lockstep. `create-mechanica` has its own line (currently `0.2.1`) — bump it too, its
  template must depend on the released `mechanica` (`^2.0.0`, never `workspace:*`).
- Both published packages carry `publishConfig.tag: "next"`. A stable release must land on
  `latest` (npm's `mechanica@latest` is still v1 today, and `npm create mechanica@latest` /
  `npm install mechanica` both resolve `latest`). Decide whether to drop the field or set it
  to `latest`; make sure `create-mechanica`'s scaffold instructions stay correct.
- Align the template's `vuewrite` range with what `mechanica` itself requires (`^1.4.1`).
- Refresh `bun.lock` after the bumps and re-verify the packed `mechanica` manifest.
- Run `bun audit`; the current findings are dev-only (sharp in dev-app, vitest, postcss via
  `@vue/compiler-sfc`). Take the cheap updates (`bun update` within ranges) if the suite stays
  green; don't chase anything that needs a major bump.

Documentation (this is the biggest gap)
- `packages/mechanica/README.md` is the npm-facing page and is out of date. Its "Install"
  paragraph claims Bun installs run the TypeScript source directly — false, tarballs ship
  `dist/` only and every consumer runs compiled output. Rewrite it so a first-time user can go
  from `npm create mechanica` to an exported site, then cover — briefly, with pointers, not a
  second CLAUDE.md — what shipped since the alpha README was written: layouts & standalone
  page blocks, multi-language pages, the Block Composer + composer manifest, the `<Image>`
  component / focal point & crop, automatic SEO at export, queries & pagination, generated
  pages, rich-text widgets, data scoping, `mechanica shot`/`thumbs`/`images`. Keep every
  claim true to the code — verify APIs against `src/core/index.ts` and the CLI before writing.
- `packages/shared/README.md` should mention the `block-format` entry point next to
  `page-format`.
- Root `README.md`: list all the user-facing docs (`CONTRACT.md`, `PREVIEW.md`,
  `COMPOSER-MANIFEST.md`) and point at `plans/` for roadmap/design notes. The root now holds
  only real docs; `plans/` holds `SEO-ROADMAP.md`, `DEFINE-COLLECTION.md`,
  `GENERATED-PAGES.md` (status notes inside them are still accurate — leave them).
- `packages/create-mechanica/template/CLAUDE.md` and `template/README.md` are what scaffolded
  users (and their Claude) read — make sure they don't contradict the new package README.
- Add a `CHANGELOG.md` at the repo root with a `2.0.0` entry: a human-readable "what changed
  since v1" summary (the v1 code lives in the sibling `../mechanics` repo, reference only) plus
  the highlights of the alpha series. Use `git log` for the alpha history; keep it to what a
  user cares about.

Hygiene
- The repo has no git tags. Tag the release commit `v2.0.0` (and `create-mechanica@<ver>` if
  you think separate tags are worth it).
- Don't touch `packages/dev-app/.mech/` fixtures (user-edited content) except where a doc
  change genuinely needs a fixture. `untitled-block.block.yml` there is scratch — never stage
  it.
- `.mech/shots` and `.mech/thumbs` outputs are gitignored except a couple of tracked
  screenshots — don't commit regenerated PNGs.

## Verification before you call it done

- `bun run test`, `bun run typecheck`, `bun run build` green.
- `bun pm pack` all three; from a temp dir outside the repo, scaffold with
  `node packages/create-mechanica/bin.js <dir>`, point the scaffold's `mechanica` at the
  tarball (and `mechanica-shared` via an npm `overrides` entry so the local tarball is used),
  `npm install`, `npm run export`, and boot `npx vite` under Node — the exact checks listed
  above, now against the 2.0.0 tarballs. Also run `npx mechanica shot /` there if a
  browser (Edge/Chrome) is available.
- Read the rendered README on a "would a stranger succeed?" basis: every command in it must
  actually run.
- Commit in sensible pieces (version bump, docs, changelog) with conventional messages; do
  not push or publish unless told.

## Publish sequence (for the user, or for you if explicitly authorized)

1. `cd packages/shared && bun publish` (it depends on nothing internal).
2. `cd packages/mechanica && bun publish` (its `mechanica-shared` dep must already be on npm
   at the same version).
3. `cd packages/create-mechanica && npm publish` (plain Node package; verify with
   `npm create mechanica@latest smoke-test` afterwards).
4. `git push --tags`.
