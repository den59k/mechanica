# mechanica-shared

Internal support package for [mechanica](https://www.npmjs.com/package/mechanica) — DOM-free types, the field-type registry, schema/default helpers, the page-generation (SSG) core, and the `.page.md` page-format codec.

You normally don't install this directly; it comes with `mechanica`. It is published separately so server-side renderers can consume it without the editor/runtime.

Entry points:

- `mechanica-shared` — types, field registry, schema helpers, `generatePage` and the `{{ }}` HTML templating engine. DOM-free by contract.
- `mechanica-shared/page-format` — `parsePage` / `serializePage` for the `.page.md` on-disk format. A separate entry point on purpose: it pulls in a YAML parser that must never reach a client bundle.
