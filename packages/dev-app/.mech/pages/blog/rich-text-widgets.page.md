---
name: Widgets inside your prose
data:
  head:
    title: Widgets inside your prose — Blog
    description: Rich text blocks can host site-defined widgets like CTA buttons.
  postMeta:
    date: "2026-03-17"
    description: defineWidget lets a site drop interactive components straight into rich-text flow.
---

::: hero #intro
title: Widgets inside your prose
@subtitle
Images, code, callouts — and anything your site defines with defineWidget.
:::

::: rich-text #body
@content
Rich text is not a walled garden. A widget is a small `{ type, create, editor }` module; it edits inline behind an error boundary and persists as a generic Markdown form on disk.
:::
