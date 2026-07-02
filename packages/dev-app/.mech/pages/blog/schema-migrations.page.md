---
name: Schema versions & migrations
data:
  head:
    title: Schema versions & migrations — Blog
    description: Rename a prop without breaking every placed block.
  postMeta:
    date: "2026-04-29"
    description: Blocks record the schema version their data was written with; older data migrates on load.
---

::: hero #intro
title: Schema versions & migrations
@subtitle
defineBlock({ version, migrate }) upgrades placed data on load — dev and export alike.
:::

::: rich-text #body
@content
Placed blocks stamp the schema version they were written with. Bump `version`, provide `migrate`, and old pages reshape themselves the next time they load; the change persists with the page's next save.
:::
