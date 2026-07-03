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
secondary:
  url: /docs
  title: Read the docs
  external: false
  openNewTab: true
note: Open source · MIT licensed
@subtitle
Author blocks as real Vue components. Arrange them on the page in a live in-browser editor. Export a static site today — render on a server tomorrow.
:::

::: logo-strip #logos
label: Built on a modern, fast toolchain
items:
  - { name: Vite 8 }
  - { name: Vue 3.5 }
  - { name: Bun }
  - { name: Vitest 4 }
  - { name: TypeScript }
:::

::: feature-grid #features
anchor: features
eyebrow: Why Mechanica
title: Everything is a Vue component
items:
  - icon: 🪄
    title: Live in-browser editor
    text: Drag, drop, nest and edit props on the real page with instant preview.
  - icon: 🗂️
    title: Scoped data
    text: Site, folder and page data — authored once, shared correctly.
  - icon: 🧩
    title: Author in SFCs
    text: A block is a Vue component that calls defineBlock. No DSL, no lock-in.
  - icon: 🧱
    title: Slots & containers
    text: Blocks nest. Drop a block inside a card or section like any layout.
  - icon: 📦
    title: Static export
    text: Render every page to HTML with SEO head templating. SSR later.
  - icon: ⚡
    title: Vite 8 + Bun
    text: Source-level compile, no string surgery. Fast dev, fast builds.
@subtitle
No proprietary block format. Your blocks are real SFCs — typed, testable, and yours.
:::

::: card #f9354ac2-2cf5-45a8-89d5-41c4b93ed40a
title: Card title
::: testimonial #quote
author: Alex Rivera
role: Frontend Lead, Northwind
avatar: { src: "" }
@quote
We replaced a tangle of CMS templates with Mechanica blocks in an afternoon. Editors get a real visual tool; we keep plain Vue components in git.
:::

::: pricing #pricing
anchor: pricing
eyebrow: Pricing
title: Start free. Scale when you ship.
subtitle: The editor and static export are open source. Hosted rendering is on the way.
plans:
  - name: Open source
    price: $0
    period: forever
    description: Everything you need to build and export a site.
    features:
      - { text: Visual block editor }
      - { text: Static site export }
      - { text: Unlimited pages & blocks }
      - { text: MIT licensed }
    ctaLabel: Get started
    ctaHref: "#get-started"
    featured: false
  - name: Team
    price: $19
    period: / editor / mo
    description: Collaboration and hosted rendering for growing teams.
    features:
      - { text: Everything in Open source }
      - { text: Hosted SSR rendering }
      - { text: Shared asset library }
      - { text: Roles & review }
    ctaLabel: Start free trial
    ctaHref: "#get-started"
    featured: true
  - name: Enterprise
    price: Let's talk
    period: ""
    description: Security, SSO and support for large organizations.
    features:
      - { text: Everything in Team }
      - { text: SSO & audit logs }
      - { text: Priority support }
      - { text: On-prem option }
    ctaLabel: Contact sales
    ctaHref: "#"
    featured: false
:::

::: cta-band #cta
anchor: get-started
title: Ship your first block today
subtitle: Clone the repo, run the dev server, and start arranging.
primaryLabel: Start building
primaryHref: "#"
note: bun create mechanica@latest
:::

::: /card

::: fields-demo #bed0813f-f3a8-44a0-806f-dcb59896c7e0
title: Checkboxes & dropdowns
tone: brand
size: lg
bordered: true
rounded: true
@text
Open this block in the editor — the Tone and Size dropdowns and the two checkboxes restyle this card live.
:::
