---
name: Home
data:
  head:
    title: My Mechanica site
    description: A site built with Mechanica — Vue blocks, edited visually.
---

::: hero #welcome
eyebrow: Welcome
title: Your Mechanica site is running
ctaLabel: Learn more
ctaHref: "#next-steps"
@subtitle
Everything on this page is a block — a plain Vue component from src/blocks. Click any block to edit its props, or edit this file directly at .mech/pages/index.page.md.
:::

::: rich-text #next-steps
@content
## Next steps

Blocks are Vue components that call `defineBlock` — drop a new `.vue` file into `src/blocks/` and it appears in the palette immediately.

- Open the block palette to add blocks to this page.
- Edit page metadata in the editor's **Page data** window.
- Create more pages from the page browser (Ctrl+K switches between them).
- Run `npm run export` to build a static site into `export/`.

This text is a rich-text field: it lives in this page file as Markdown, and you can edit it inline with the WYSIWYG editor.
:::
