---
name: Rich text
meta: { title: Rich text — Mechanica Docs }
data:
  head:
    title: Rich text — Mechanica Docs
    description: One rich-text field — authored as Markdown, edited WYSIWYG, stored as Markdown.
order: 2
---

::: docs-layout #docs
::: doc-section #markdown-prose
title: Markdown prose
::: prose #p1
@body
Every prose field in these docs — including this **Prose** block — is rich text.
You author it as a clean Markdown `@body` region (no escaping; lists, `code`,
[links](/docs), and emphasis all work), the editor loads it as a `vuewrite`
document for WYSIWYG editing, and it saves straight back to Markdown.
:::

::: /doc-section

::: doc-section #the-rich-text-block
title: The rich-text block
::: prose #p2
@body
The **Rich text** block is that same field as a standalone region — handy for a
bare block of formatted text. Open it in the editor and select text to format it,
or flip the **Markdown** switch to edit the source directly:
:::

::: rich-text #rt1
@content
This paragraph is stored as a vuewrite document and edited inline.

Select any text in the **editor** to make it bold, italic, or a *link*.
:::

::: callout #c1
tone: tip
title: Storage
@body
Rich text is stored as Markdown right here in the `.page.md` file — the same
clean `@content` region you'd write by hand. The editor loads it as a vuewrite
document (JSON) for fast WYSIWYG editing and saves it straight back to Markdown.
:::

::: /doc-section

::: /docs-layout
