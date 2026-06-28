---
name: Rich text
meta: { title: Rich text — Mechanica Docs }
data:
  head:
    title: Rich text — Mechanica Docs
    description: One rich-text field — authored as Markdown, edited WYSIWYG, with inline widgets.
order: 2
---

::: docs-layout #docs
::: doc-section #the-rich-text-field
title: The rich-text field
@content
Every section on these pages is one **rich-text** field. You author it as a clean
Markdown `@content` region (no escaping; lists, `code`, [links](/docs), and
emphasis all work), the editor loads it as a `vuewrite` document for WYSIWYG
editing, and it saves straight back to Markdown.

Select any text in the **editor** to make it bold, italic, or a *link*, or flip
the **Markdown** switch to edit the source directly.
:::

::: doc-section #inline-widgets
title: Inline widgets
@content
The **Insert** menu drops content widgets right into the prose flow — they live
inside the rich text, not the block palette:

- an **image** (uploaded through the usual picker),
- a **code** block with a language,
- a **callout** in one of three tones.

Each is a `vuewrite` widget that saves as plain Markdown — an image tag, a fenced
code block, or a tagged callout — so the document stays human-readable.

<callout tone="tip">**Storage** — rich text is stored as Markdown right here in the `.page.md` file, the same region you'd write by hand. The editor keeps it as a vuewrite document (JSON) for fast WYSIWYG editing and writes it back to Markdown on save.</callout>
:::

::: /docs-layout
