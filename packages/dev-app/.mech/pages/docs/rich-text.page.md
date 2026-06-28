---
name: Rich text
meta: { title: Rich text — Mechanica Docs }
data:
  head:
    title: Rich text — Mechanica Docs
    description: Two ways to author prose — Markdown blocks and the WYSIWYG editor.
order: 2
---

::: docs-layout #docs
::: doc-section #markdown-prose
title: Markdown prose
::: prose #p1
@body
Most prose in these docs is a **Prose** block: a plain Markdown field rendered
with `markdown-it`. You author it as a clean `@body` region — no escaping, full
Markdown (lists, `code`, [links](/docs), and emphasis).
:::
::: /doc-section
::: doc-section #the-rich-text-block
title: The rich-text block
::: prose #p2
@body
For inline WYSIWYG editing, the **Rich text** block uses `vuewrite`. Its value is
a structured document edited directly on the page. Below is a live rich-text
block — open it in the editor and select text to format it:
:::
::: rich-text #rt1
content:
  - text: This paragraph is stored as a vuewrite document and edited inline.
  - text: Select any text in the editor to make it bold, italic, or a link.
:::
::: callout #c1
tone: warning
title: Storage
@body
Rich-text values currently serialize as a structured array in the page file.
Migrating them to Markdown strings — so they author as `@body` regions too — is
the planned next step.
:::
::: /doc-section
::: /docs-layout
