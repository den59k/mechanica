# mechanica-shared

Internal support package for [mechanica](https://www.npmjs.com/package/mechanica): DOM-free types, the field-type registry, schema/default helpers, the page-generation (SSG) core, SEO helpers, and the codecs for Mechanica's on-disk formats.

You normally don't install this directly; it comes with `mechanica`. It's published separately so server-side renderers can use it without the editor or the runtime. Keep its version in step with `mechanica`'s.

Entry points:

- `mechanica-shared`: types, the field registry, schema helpers, `generatePage` and the `{{ }}` HTML templating engine, the query engine, locale and translation-overlay helpers, and the SEO helpers (`applySeoTags`, `auditPageHtml`, `buildSitemap`, `buildRobotsTxt`). DOM-free by contract.
- `mechanica-shared/page-format`: `parsePage` / `serializePage` for `.page.md` page files.
- `mechanica-shared/block-format`: `parseComposedBlock` / `serializeComposedBlock` for the Block Composer's `.block.yml` files.

The two codecs are separate entry points on purpose: they pull in a YAML parser that must never reach a client bundle.
