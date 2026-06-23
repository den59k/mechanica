# Mechanica

A platform for building Vue 3 websites with a visual block editor. Site authors write Vue SFC "blocks", a visual editor arranges them into pages, and the result is rendered server-side.

This is the v2 rewrite — built on **Vite 8 / Bun / Vue 3.5**, English throughout, test-covered from the start. See [PLAN.md](./PLAN.md) for the architecture and roadmap.

## Layout

Bun workspaces under `packages/*`:

- **`mechanica`** — the published plugin: the `defineBlock` runtime, the Vite plugin (block compiler + dev server + build), the in-browser editor, and the `mechanica` CLI.
- **`shared`** — `@mechanica/shared`: DOM-free types, schema helpers, and the page-generation core.
- **`dev-app`** — playground site used to exercise the plugin end to end.

## Commands

```bash
bun install
bun run test          # run all package test suites (Vitest)
```
