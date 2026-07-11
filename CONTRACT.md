# Mechanica page format (`.page.md`) — the contract

This is the on-disk format for Mechanica **pages**. It replaces the per-page JSON
files under `.mech/pages/**`. It is the single source of truth: the dev server
parses it on load and serializes it on save, and the static export reads it
directly.

It is designed for one primary author — **Claude Code** — filling pages with
content by hand, while staying lossless enough that the visual editor can
round-trip it. The two priorities, in order:

1. **Prose is raw Markdown.** No escaping, no JSON string surgery.
2. **Structure is shallow YAML.** Familiar, diff-friendly, and — crucially —
   *nesting depth never compounds indentation* (see [Indentation](#indentation)).

> Scope: this contract governs **page files only**. Site/folder shared-data
> stores (`.mech/data.json`, `.mech/folders.json`) remain JSON — they hold
> machine-managed scoped values, not hand-authored prose.

---

## 1. File shape

A page file is **YAML frontmatter** (the page envelope) followed by a flat
sequence of **block fences** (the content tree):

```text
---
<frontmatter: everything about the page except its content>
---

<block fence>
<block fence>
...
```

- **Extension:** `.page.md` (the `.md` tail gives Markdown highlighting in
  editors; the `.page` namespace tells the loader it's a Mechanica page).
- **Encoding:** UTF-8, LF newlines. A trailing newline is recommended.
- **Path mapping** is unchanged from the JSON store: `pages/index.page.md` → `/`,
  `pages/docs.page.md` → `/docs`, `pages/guide/index.page.md` → `/guide`.

### Frontmatter (the page envelope)

The leading `---` … `---` block is YAML carrying **everything that is not
`content`** — it maps 1:1 to the old page JSON minus the `content` array:

```yaml
---
name: Docs                       # editor label for the page
draft: true                      # optional; a work-in-progress page (omit when published)
layout: docs                     # optional; key into the app's `layouts` map (omit for the default)
meta: { title: "Docs — Mechanica" }   # build-time <head> hints
data:                            # page-scoped data overrides (defineData)
  head:
    title: Docs — Mechanica
    description: Getting started with Mechanica.
order: 0                         # optional ordering (omit when default)
orderAfter: null                 # optional
---
```

Omit keys that are absent. `data: {}` is written when a page has no overrides.

**`draft`** marks a work-in-progress page. A draft renders and edits normally in
the dev server, but is **hidden from queries** (`usePages`/`usePagination`) and
**skipped by the static export** (no HTML file, no sitemap entry). It is only
ever written when `true`; publishing a page removes the key. Serialized order:
`name`, `draft`, `layout`, `meta`, `data`, `order`, `orderAfter`, `path`.

**`layout`** picks the page's shell — a key into the app's
`defineMechanicaApp({ layouts })` map (rendered by the core `<Layout/>`
component). Omit it for the default layout (the map's first entry); an unknown
key also falls back to the default. The layout is **base-owned** on
multi-language sites: translation files never carry it and always inherit the
base page's.

Two `meta` keys carry export-time SEO semantics: **`meta.noindex: true`**
injects `<meta name="robots" content="noindex">` and drops the page from
`sitemap.xml` (for published-but-unlisted pages — thank-you pages, `/404` gets
this automatically), and **`meta.lastmod: "YYYY-MM-DD"`** overrides the page
file's mtime as the sitemap `<lastmod>` (useful on CI, where checkouts reset
mtimes). Other `meta` keys remain free-form `{{ page.meta.* }}` template hints.

---

## 2. Block fences

Each content block is a fence opened by `:::` and closed by `:::`:

```text
::: <blockId> [#<id>] [<key>=<value> ...]
<head>
<regions and children>
:::
```

### The open line

```text
::: landing-hero #hero
```

- `<blockId>` — **required**, matches `[A-Za-z][\w-]*`. The block component id.
- `#<id>` — **optional** content-block id. When absent, a fresh id is generated
  on load (so hand-authored files never carry uuids). The editor writes ids back
  so selection/history are stable; hand-authors normally omit them.
- `<key>=<value>` — **optional** fence attributes. Defined attributes:
  - `slot=<name>` — see [Named slots](#5-named-slots);
  - `v=<int>` — the block-schema version the data was written with (absent = 1).
    Written by the editor for blocks that declare `version` in `defineBlock`; on
    load, data older than the current schema runs the block's `migrate` hook.
    Hand-authors normally omit it (the data is then treated as version 1).

  Unknown attributes are reserved (currently an error, to catch typos).

### The head (block props)

Everything between the open line and the first region/child/close is the
block's **YAML head** — its props (`block.data`), parsed as a single YAML
mapping:

```text
::: feature-grid #features
eyebrow: Why Mechanica
title: Everything is a Vue component
items:
  - { icon: 🪄, title: Live editor, text: Drag, drop, edit props live. }
  - { icon: 🗂️, title: Scoped data, text: Authored once, shared correctly. }
:::
```

**Head-first ordering is mandatory.** All YAML props come *before* the first
`@field` region or child block. You cannot place a plain `key: value` prop after
a region, because inside a region a `key:` line is just prose. Canonical layout
is always: **head → regions → children → close.**

Scalars, nested objects (`secondary: { url: /docs, openNewTab: true }`), and
arrays of objects all live here as ordinary YAML.

**Image values stay lean.** An `image`-field prop is authored as
`image: { src: /@mechanica/assets/<file>, alt: "…" }` (plus optional
`width`/`height`). Never inline a `previewSrc` data URI — the blur-up preview
and any missing dimensions live in the **image manifest**
(`.mech/images.json`), maintained by the editor automatically and generated
headlessly with **`mechanica images`** (requires the project's optional
`sharp` dependency). The dev server and the export inject manifest entries
into the rendered state; a data-URI `previewSrc` that does sneak into a save
is moved to the manifest and stripped from the page file.

---

## 3. `@field` regions (prose)

A region holds a block prop's value as **raw text** (Markdown) with no escaping.
It is the ergonomic home for anything long or prose-like.

```text
::: hero #hero
eyebrow: New
title: Welcome
@subtitle
Author blocks as real Vue components. Arrange them on the page in a live
in-browser editor.

A second paragraph after a blank line — still the subtitle.
:::
```

### Boundaries — the core rule

A region **starts** at a line that is exactly `@<fieldName>` (only whitespace
after the name) and **captures every following line verbatim** until the first
line that is one of exactly **three structural terminators**:

1. another field marker — `@<name>`
2. a child block open — `::: <blockId> …`
3. the block's close — `:::` (bare or labeled)

Everything else is content. In particular, **none** of these end a region — they
are ordinary prose:

- blank lines (so multi-paragraph prose works)
- lines containing `:` or `: ` (`Note: like this`)
- lines starting with `-`, `#`, `>`, `|`, digits (Markdown lists, headings,
  quotes, tables)

`<fieldName>` may be a dotted path (`@meta.note`) to set a nested value; a bare
name sets `block.data[name]`.

### Code-fence awareness

The region scanner tracks Markdown code fences (` ``` ` and `~~~`). **Inside an
open code fence, the three terminators are inert.** This is essential — Mechanica's
own docs contain literal format syntax in code samples:

````text
::: prose #intro
@body
Here is a block, written in the page format:

```md
::: hero #welcome
title: Welcome
@subtitle
This ::: and this @title do NOT end the region — they're fenced code.
:::
```

And `@media` is just text here:

```css
@media (min-width: 768px) { .card { padding: 2rem; } }
```
:::
````

### Escape hatch

For the rare case of a literal `:::` or `@name` at the **start of a line**,
*outside* a code fence, prefix a backslash:

```text
@body
A fence at the start of a line needs a backslash:

\::: this is text, not a block
```

The backslash is removed on parse. (Mid-line `:::`/`@` never need escaping —
only line-initial tokens are structural.)

---

## 4. Nesting

Nesting is defined entirely by `:::` **pairing** — a stack, like HTML tags or
parentheses. A child fence opened before its parent closes nests inside that
parent:

```text
::: card #card
title: Card title
::: testimonial #quote
author: Alex Rivera
@quote
A nested block — child of card, because card has not closed yet.
:::
::: cta-band #cta
title: Ship today
:::
:::
```

`card` contains `[testimonial, cta-band]`. To make a block a *sibling* instead,
close the parent first. There is no depth limit.

---

## 5. Named slots

A block component may expose named slots (`<slot name="start">`). Assign a child
to a slot with the `slot=` attribute on the **child's** open fence; children with
no `slot=` go to the default slot:

```text
::: split #layout
gap: lg
::: prose #left slot=start
@body
### Left column
:::
::: prose #right slot=end
@body
### Right column
:::
:::
```

This is why `@` means exactly one thing (a prose field): slots ride on the fence,
never on a `@`-line. In the content tree this produces
`children: { start: [...], end: [...] }`; default-slot children produce
`children: [...]` (an array), matching `ContentBlock.children`.

---

## 6. Closing fences — optional labeled close

The default close is a bare `:::`, which closes the **innermost** open block:

```text
::: hero #hero
title: Welcome
:::
```

A **labeled close** — `::: /<blockId>` — also closes the innermost open block,
but **asserts which block it is**. If the innermost open block's id doesn't
match (or nothing is open), it's a parse error pointing at that line:

```text
::: card #card
title: Card title
::: testimonial #quote
author: Alex Rivera
:::
::: /card
```

(The bare `:::` closes the leaf `testimonial`; the labeled `::: /card` closes the
container and names what it closes.)

**It is optional and exists purely to localize errors.** A missing `:::`
silently re-parents everything after it (like a missing `}` in JSON); a labeled
close turns that into a precise, line-numbered error at the point of mismatch.

- On **small/flat pages** labels are visual clutter — omit them.
- On **large/deeply-nested pages** they pin down exactly where a fence went
  missing — use them.

`::: /` (no id) is accepted as an explicit-but-unchecked close. The parser
accepts bare, `::: /`, and `::: /id` interchangeably; only `::: /id` is checked.

**Serializer default:** the editor emits a **labeled close for any block that
has children**, and a bare close for leaf blocks. This realizes the intent
automatically — flat pages stay clean, and labels appear exactly at the
structural points (containers) where mis-nesting happens. (A future per-project
knob can force all-bare or all-labeled.)

---

## 7. Indentation

The defining property:

> **Block nesting uses zero indentation.** Everything inside a block — head props,
> `@field` markers, child fences, closes — sits at **column 0**, no matter how
> deep the block is in the tree. Nesting comes from `:::` pairing (and the labeled
> close), not from indentation.

This is deliberate: there is simply *nothing to count or align* when nesting, so
the most common indentation mistake cannot happen. Concretely:

- **Structural tokens (`:::`, `@field`) are recognized only at column 0.** A
  child fence must be flush-left; an indented `  ::: child` is not a fence — it is
  read as head content and will surface as a clear, line-numbered YAML error. The
  serializer always emits flush-left.
- **The only indentation that exists is YAML-internal** — arrays of objects /
  nested objects *within a single block's head*. Because a deeper block's interior
  still resets to column 0, this indentation is bounded by one block's own prop
  shape (usually 1–2 levels) and **never compounds with tree depth**. Leaf objects
  are emitted flow-style (`- { text: … }`) to keep even that shallow.
- This is exactly why an indented YAML block scalar can safely contain a `:::`
  line: it is past column 0, so it is content, never a fence.

A YAML head misalignment breaks **one block**, reported with a line number — not
the whole page.

---

## 8. YAML quoting gotchas (for hand-authors)

Inside heads (real YAML), a few values need care. The serializer handles these
automatically; they only bite hand-authoring:

| Value | Why | Write it as |
| --- | --- | --- |
| `#get-started` | `#` starts a comment | `"#get-started"` |
| `another page: search` | `: ` starts a mapping | block scalar `>` / `|`, or quote |
| empty string | ambiguous | `""` |
| `no`, `yes`, `on`, `off` | parse as booleans | quote if you mean the word |
| leading `@ & * ? | > % ! - [ {` | YAML indicators | quote |

Prose that contains `: ` or `#` is exactly why **top-level prose belongs in an
`@field` region** (raw text, no quoting) and only *nested* prose pays the YAML
tax via a block scalar:

```text
sections:
  - heading: Link between pages
    body: >
      Use the smartLink field to point at another page: search by name or path
      and the link's title is filled in for you.
```

---

## 9. Identifiers, rich text, and reserved syntax

- **Content-block ids** (`#id`) are optional and auto-generated when absent.
  Editor-written files keep them; hand-authored files usually omit them.
- **Rich text** (`vuewrite` fields, schema format `richText`) serialize as a
  plain Markdown **`@field` region** — the same clean prose you'd write by hand,
  no JSON to escape. On disk it's Markdown; in page state it's a `vuewrite`
  `Block[]` (the fast format to render/edit). The codec converts between the two
  at the disk boundary (`vuewrite/markdown`), so the conversion is invisible to
  both authors and the editor. The caller supplies the adapter (`RichTextCodec`)
  — the dev server reads it from the project's block schemas, the CLI export from
  its blocks list — which is also why this module stays vuewrite-free. A region
  is only treated as richText when the owning block's prop declares that format;
  every other `@field` region is a literal string. Legacy pages that stored a
  richText value inline as a YAML array still parse (the array is kept as-is) and
  re-serialize to a region on the next save.
- **Reserved line-initial tokens** (outside code fences): `:::`, `@<name>`. The
  document delimiter `---` is reserved only as the frontmatter fence.

---

## 10. Canonicalization (what the editor normalizes on save)

The format is a single source of truth, so when the **editor** saves a page it
re-emits it in canonical form. Files only Claude touches are left exactly as
written. Canonical form:

- frontmatter keys in a fixed order; `data: {}` when empty
- per block: **head props first, then `@field` regions, then children**
- a top-level string prop is emitted as an `@field` region when it contains a
  newline or exceeds ~80 characters; otherwise inline
- a `richText` prop is **always** an `@field` region (its `Block[]` rendered to
  Markdown), regardless of length
- leaf objects/arrays flow-style when short, block-style when large/multiline
- ambiguous scalars quoted; `: `/`#` prose as block scalars
- container blocks get a labeled close; leaf blocks a bare close
- ids emitted for every block

Because the parser treats `@field` regions and inline strings identically, and
labeled and bare closes identically, **canonicalization never changes the parsed
tree** — only its textual presentation.

---

## 11. Grammar reference

```ebnf
page         = [ frontmatter ] block* ;
frontmatter  = "---" NL yaml NL "---" NL ;

(* Structural lines (open / close / @field) are recognized ONLY at column 0. *)
block        = open NL [ head ] region* child* close ;
open         = ":::" sp blockId [ sp "#" id ] { sp attr } ;
attr         = key "=" value ;                       (* e.g. slot=start *)
head         = yamlLine+ ;        (* up to first region | child | close *)
region       = "@" fieldPath NL rawText ;            (* code-fence aware *)
child        = block ;
close        = ":::" [ sp? "/" [ blockId ] ] NL ;

blockId      = letter { letter | digit | "-" | "_" } ;
fieldPath    = name { "." name } ;
```

`rawText` is captured verbatim until the next region/child/close at structural
level, honoring code fences and the `\` escape. `head`, `region`, and `attr`
values are interpreted as YAML.

---

## 12. Worked examples

### Small page — no labeled closes

```text
---
name: About
meta: { title: About }
data: {}
---

::: hero #b3
title: About this project
subtitle: The v2 rewrite of Mechanica
:::
```

### Larger page — labeled closes on containers, prose in regions

```text
---
name: Home
meta:
  title: Mechanica — The visual block editor for Vue
  description: Build Vue sites with a visual block editor. Vite 8, Vue 3.5, Bun.
data:
  head:
    title: Mechanica — The visual block editor for Vue
    description: Build Vue sites with a visual block editor. Vite 8, Vue 3.5, Bun.
---

::: landing-hero #hero
eyebrow: Vite 8 · Vue 3.5 · Bun
title: Build Vue sites with a visual block editor
primaryLabel: Start building
primaryHref: "#get-started"
secondary: { url: /docs, title: Read the docs, external: false, openNewTab: true }
note: Open source · MIT licensed
@subtitle
Author blocks as real Vue components. Arrange them on the page in a live
in-browser editor. Export a static site today — render on a server tomorrow.
:::

::: card #card
title: Card title
::: testimonial #quote
author: Alex Rivera
role: Frontend Lead, Northwind
@quote
We replaced a tangle of CMS templates with Mechanica blocks in an afternoon.
Editors get a real visual tool; we keep plain Vue components in git.
:::
::: pricing #pricing
eyebrow: Pricing
title: Start free. Scale when you ship.
plans:
  - name: Open source
    price: $0
    period: forever
    features:
      - { text: Visual block editor }
      - { text: Static site export }
  - name: Team
    price: $19
    period: / editor / mo
    features:
      - { text: Hosted SSR rendering }
      - { text: Roles & review }
:::
::: /card
```

Everything is flush-left: `testimonial` and `pricing` are children of `card`
purely because `card` hasn't closed yet, and `::: /card` makes that wrapping
explicit. The only indentation is YAML's own, inside the `pricing` head.
