---
name: A page is a Markdown file
data:
  head:
    title: A page is a Markdown file — Blog
    description: The .page.md format keeps pages human-readable and AI-editable.
  postMeta:
    date: "2026-02-24"
    description: Pages persist as .page.md — frontmatter for data, fenced blocks for content, Markdown for prose.
---

::: hero #intro
title: A page is a Markdown file
@subtitle
Open any page in a text editor and it reads like a document, not a database dump.
:::

::: rich-text #body
@content
Frontmatter holds the page's data, `:::` fences hold placed blocks, and rich text lives as plain Markdown regions. Humans can diff it, and Claude can co-author it — the editor detects external edits and syncs live.
:::
