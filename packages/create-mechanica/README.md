# create-mechanica

Scaffold a new [Mechanica](https://www.npmjs.com/package/mechanica) site — a Vue 3 website with a visual block editor.

```bash
npm create mechanica@latest my-site
# or
bun create mechanica my-site

cd my-site
npm install
npm run dev
```

Generated projects run on plain Node ≥ 20.19 (npm/pnpm/yarn) or [Bun](https://bun.sh).

## What you get

- `src/blocks/` — starter blocks (`Hero`, `Rich text`) showing the `defineBlock` macro, `previewData`, and manual code splitting (`chunk`)
- `.mech/pages/index.page.md` — a starter page in Mechanica's human-readable page format
- Rich-text rendering wired end to end (`RichTextView` + shared renderer config)
- `{{ head.* }}` metadata templating from a page-scoped data entry
- `src/composer.ts` — a Block Composer manifest exposing a starter `Button` component to the visual composer
- `AGENTS.md` — guidance for AI coding assistants (Claude Code, Codex and others) on authoring blocks and pages in the project
- Static export via `npm run export`

## Development (this package)

The CLI (`index.js`) is dependency-free, plain Node-compatible ESM. The `template/` directory is published verbatim; `_gitignore` is renamed to `.gitignore` on scaffold (npm strips real `.gitignore` files from packages).

Template dependencies pin **published** versions (never `workspace:*`) — bump them when releasing `mechanica`.
