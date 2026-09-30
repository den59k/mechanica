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

To scaffold into the current folder, pass `.`: `npm create mechanica@latest .`. The target may already hold dotfiles such as `.git`, `.claude` or `.vscode`; anything else makes the scaffolder stop, and it never overwrites a file.

## With an AI coding agent

Claude Code, Codex and similar agents can scaffold and build the site for you. Open an empty folder in the agent and paste:

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
