---
name: create-mechanica-site
description: Create a new Mechanica website project, a Vue 3 site with a visual block editor (npm packages `mechanica` and `create-mechanica`). Use when the user asks to create, start, scaffold or set up a Mechanica site or project. Checks for Node.js or Bun, scaffolds the project, installs dependencies, starts the dev server, then hands over to the project's own AGENTS.md. Not for work inside an existing Mechanica project; there, follow that project's AGENTS.md.
---

# Create a Mechanica site

Mechanica builds Vue 3 websites out of **blocks** (Vue components with a typed props schema) arranged into **pages** (Markdown files), with a visual editor that runs on top of the live site in development.

This skill only gets a new project running. How to write blocks and pages is documented in the scaffolded project's `AGENTS.md` and in the installed package's README, and those always match the installed version. Mechanica 2 changed nearly every API from 1.x, so don't write Mechanica code from memory: read those files first.

## 1. Pick the folder

- If the current folder is empty, or holds only dotfiles such as `.git`, `.claude` or `.vscode`, scaffold into it: the folder argument is `.`.
- Otherwise scaffold into a new subfolder named after the site. Ask for a name only when the conversation doesn't suggest one.

The scaffolder refuses a folder that contains other files and never overwrites anything. If it refuses, use a subfolder; don't move or delete the user's files to make room.

## 2. Find a JavaScript runtime

Run `node -v` and `bun -v`.

- **Node.js 20.19+ or 22.12+**: use npm, or pnpm/yarn if the user prefers one.
- **No suitable Node.js, but Bun is installed**: use Bun for everything. It is both the runtime and the package manager.
- **Neither**: ask the user before installing anything, then install Bun. It is one binary in the user's home folder and needs no administrator rights, which makes it simpler than installing or upgrading Node.js:
  - macOS and Linux: `curl -fsSL https://bun.sh/install | bash`
  - Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`

  The shell you are running in keeps its old `PATH` after the install. For the rest of the session call Bun by its absolute path: `~/.bun/bin/bun`, or `%USERPROFILE%\.bun\bin\bun.exe` on Windows.

## 3. Scaffold, install, start

With npm:

```bash
npm create --yes mechanica@latest <folder>
cd <folder>
npm install
npm run dev
```

With Bun:

```bash
bun create mechanica <folder>
cd <folder>
bun install
bun run dev
```

Start the dev server as a background process and leave it running: the user works in it, and the screenshot commands reuse it. It prints its URL, `http://127.0.0.1:5173/` unless that port is taken. Check that the URL answers before you report it.

If the install fails, show the user the error. Don't work around it by pinning an older version or a prerelease.

## 4. Hand over to the project

1. Read `AGENTS.md` in the project root and follow it from here on. It covers the everyday loop (blocks in `src/blocks/`, pages in `.mech/pages/`, checking your work with `mechanica shot`) and points to the full documentation in `node_modules/mechanica/README.md`.
2. Tell the user which folder the site is in and the URL to open. The page there has the editor on top of it, so they can arrange blocks and edit content themselves; the files you edit update it live.
3. If the user has already described the site they want, start building it. If they haven't, ask what it should be.

## When the project can't run on the user's machine

The editor is served by the dev server, on the machine where your commands run. In a cloud sandbox or a remote container the user can't open that URL. Say so before you scaffold: you can still build the site there and produce static HTML with `npm run export`, but the user gets the visual editor only by running the project on their own computer.

`mechanica shot`, which `AGENTS.md` uses to verify visual work, needs Chrome or Edge on the machine, and Node.js 22+ or Bun. If it can't run, tell the user that you couldn't check the result visually.
