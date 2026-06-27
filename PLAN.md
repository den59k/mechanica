# Plan: adopt the `.page.md` page format

Implements the format specified in [CONTRACT.md](./CONTRACT.md). The page store
moves from per-page JSON to a human-readable, Markdown-centric text format whose
primary author is Claude Code.

## Locked decisions

- **Canonical storage.** `.page.md` is the source of truth; the dev server parses
  on load and serializes on save. (Not an import/export layer over JSON.)
- **Full page format now.** Not just rich-text → Markdown.
- **Extension `.page.md`.**
- **Rich-text → Markdown string is deferred** to a fast-follow. It rides the
  `@field` mechanism with no format change when we do it. (See [§Deferred](#deferred-fast-follow).)
- **Labeled close is optional.** Parser accepts bare / `::: /` / `::: /id`;
  serializer labels container closes only.
- **Flush-left layout.** Block interiors and child fences sit at column 0;
  nesting is `:::` pairing + labeled closes, not indentation. (Refined from the
  earlier "cosmetic indentation" idea during implementation — strictly simpler
  and more robust: structural tokens are recognized only at column 0, so an
  indented YAML block scalar can safely contain a `:::` line.)
- **Scope: page files only.** `.mech/data.json` and `.mech/folders.json` stay JSON.

## What does NOT change

- The editor's in-memory model stays `ContentBlock[]`, and the editor ↔ dev-server
  **wire protocol stays JSON** ([editor.ts](packages/mechanica/src/editor/editor.ts)
  posts an `EditorSnapshot`; [middleware.ts](packages/mechanica/src/vite/dev/middleware.ts)
  `/save` reads it). Only the **on-disk codec** changes. No editor/runtime/bridge work.
- `transformIndexHtml` ([plugin.ts](packages/mechanica/src/vite/plugin.ts)) already
  calls `readPage` — it works unchanged once the store swaps formats.

---

## 1. Dependency

Add **`yaml`** (pure-JS, Bun-compatible) to `@mechanica/shared`
([packages/shared/package.json](packages/shared/package.json)) — the codec lives
there and needs a real YAML parser/emitter. Used for the frontmatter and each
block head; the `:::`/`@field` framing is our own.

## 2. The codec — `packages/shared/src/page-format.ts`

DOM-free, schema-agnostic, pure functions. Exported from
[packages/shared/src/index.ts](packages/shared/src/index.ts).

```ts
import type { ContentBlock } from './types'

export interface PageDoc {
  name?: string
  meta?: Record<string, unknown>
  data: Record<string, unknown>
  content: ContentBlock[]
  order?: number
  orderAfter?: string | null
  path?: string
}

/** Parse a `.page.md` document into a page object. Throws PageParseError with a line. */
export function parsePage(text: string): PageDoc

/** Serialize a page object into canonical `.page.md` text. */
export function serializePage(doc: PageDoc): string

export class PageParseError extends Error {
  constructor(message: string, public readonly line: number) { super(message) }
}
```

`PageDoc` is the existing `PageFile` shape minus the JSON-ness; the dev store's
`PageFile` interface is aligned to (or re-uses) `PageDoc`.

### Parser outline

1. Split optional frontmatter (`---` … `---`) → `yaml.parse` → envelope
   (`name`/`meta`/`data`/`order`/`orderAfter`/`path`). Default `data` to `{}`.
2. Tokenize the body line-by-line with a **block stack**:
   - line-initial `::: <blockId> …` (whitespace-tolerant) → push a block;
     parse `#id` + `slot=`/attrs; assign into parent's default or named slot.
   - line-initial `:::` / `::: /` / `::: /id` → pop; if `/id`, assert it matches
     the popped block's id (else `PageParseError`).
   - line-initial `@<field>` → begin a region on the current block (see below).
   - otherwise → a head line of the current block (buffered).
   - `\:::` / `\@` line-initial → de-escape to literal head/region text.
3. **Head**: buffered head lines, dedented by their min indent, `yaml.parse`d into
   `block.data`. Merge any region values on top.
4. **Region**: capture verbatim until the next structural terminator, **tracking
   ` ``` `/`~~~` code fences** so terminators inside code are inert. Dedent by the
   marker's indent; trim surrounding blank lines; assign to `block.data[field]`
   (dotted path → nested). Auto-generate `id` for any block lacking `#id`.
5. Unbalanced fences (stack non-empty at EOF, or a close with empty stack) →
   `PageParseError` with the line.

### Serializer outline

Inverse, emitting canonical form (CONTRACT §10):

- frontmatter via `yaml.stringify` in fixed key order; `data: {}` when empty.
- per block: open line (`::: blockId #id [slot=…]`) → head → regions → children → close.
- **head**: props that are *not* promoted to regions, `yaml.stringify`d; leaf
  objects/arrays flow-style when short & single-line, block otherwise.
- **region promotion**: a *top-level* string prop becomes an `@field` region when
  it contains a newline or exceeds ~80 chars; else inline. Nested strings stay
  YAML (block scalar when multiline or containing `: `/`#`).
- **close**: `::: /blockId` when the block has children, else bare `:::`.
- children indented two spaces under their parent (cosmetic; round-trips).

### Tests — `packages/shared/test/page-format.test.ts`

The codec's contract is round-trip fidelity, so this is the heaviest suite:

- `parse(serialize(doc))` deep-equals `doc` (ids preserved) across fixtures:
  the four migrated dev-app pages + the CONTRACT stress example.
- `serialize(parse(text))` is stable (idempotent) on canonical input.
- Units: head-first ordering; `@field` boundaries (the 3 terminators; colons/
  hashes/blank lines are content); **code-fence-aware** regions (`:::`/`@media`
  inside ``` are inert); `\:::` escape; named slots → `{slot: [...]}`; default
  slot → array; deep nesting via pairing; cosmetic indentation (flush-left vs
  indented parse identically); labeled-close match **and mismatch → PageParseError**;
  YAML gotchas (`#`, `: `, empty string, emoji/Cyrillic, base64 data-URI);
  empty page; `data: {}`.

## 3. Wiring the dev store — `packages/mechanica/src/vite/dev/pages-store.ts`

Swap JSON for the codec; keep every function's signature. `PageFile` → `PageDoc`.

- `getPagePath`: `.json` → `.page.md` (and the directory-index probe).
- `readPage`: `parsePage(fs.readFileSync(...))`; empty page when missing.
- `savePage` / `createPage` / `duplicatePage` / `movePage` / `renamePage`:
  read-modify via `parsePage`, write via `serializePage`.
- `listPages` / `listFolders`: filter `.page.md`; derive the URL path by stripping
  `.page.md` (the `parse(relative).name` logic adjusts for the double extension).

## 4. Wiring static export — `packages/mechanica/src/cli/export.ts`

`readPages` reads `.page.md` (not `.json`) via `parsePage`. The rest of the export
pipeline (`generateProject`, scoped-data merge) is unchanged.

## 5. Migration of the dev-app fixtures

Convert and replace (required — we're changing the store):

- `packages/dev-app/.mech/pages/{index,docs,about,playground}.json` → `*.page.md`,
  then delete the `.json`. Use the same conversions validated in conversation
  (faithful round-trips incl. base64 image, Cyrillic, empties, the `card` subtree).
- Implement as a tiny one-off script (`parsePage`/`serializePage` round-trip from
  the JSON) run once, so the output is exactly canonical; verify by diffing the
  rendered HTML before/after.

## 6. Verification

- `bun run --filter @mechanica/shared test` + `--filter mechanica test` green;
  both `typecheck`s green.
- `cd packages/dev-app && bun run dev`: every page loads, renders, edits, and
  **saves back to `.page.md`** (inspect the written file); no Sass/transform errors.
- `bun run export`: `export/index.html`, `export/docs/index.html`, etc. match the
  pre-migration output.
- Hand-edit a `.page.md` (add a paragraph in an `@field`, reorder a block) and
  confirm the dev server picks it up.

## Risks & mitigations

- **Round-trip fidelity** is the crux → exhaustive parse/serialize tests seeded
  from the real fixtures + the stress example; ids preserved.
- **YAML footguns** in hand-authored heads → serializer always quotes ambiguous
  scalars; CONTRACT §8 documents the few hand-author cases; parse errors are
  local + line-numbered.
- **Double extension** (`.page.md`) in path/list logic → covered by a focused
  `getPagePath`/`listPages` test.
- **Code-fence-aware scanning** is the subtle parser rule → has its own tests
  (the format documenting itself).

## Deferred (fast-follow)

**Rich-text → Markdown string.** Change the `richText` field value type from
`Block[]` (vuewrite AST) to a Markdown string end-to-end: convert at the
[RichTextField.vue](packages/mechanica/src/editor/fields/editors/RichTextField.vue)
boundary via `vuewrite/markdown` (`markdownToBlocks`/`blocksToMarkdown`), update
the default and the asset-walk in
[generate-page.ts](packages/shared/src/generate-page.ts), and the `Article`
fixture/tests. It then serializes as a clean `@field` region with no change to
this contract.

## Phase checklist

- [x] Add `yaml` to `@mechanica/shared`.
- [x] `page-format.ts`: `parsePage` / `serializePage` / `PageDoc` / `PageParseError` + export.
- [x] Round-trip + unit test suite (seeded from fixtures + CONTRACT stress example).
- [x] Re-point `pages-store.ts` to the codec (`.page.md`).
- [x] Re-point `export.ts` `readPages`.
- [x] Migrate the four dev-app pages; delete the `.json`.
- [x] Update store/export tests that assumed `.json`.
- [x] Verify: tests, typecheck, dev server, export, hand-edit.
- [x] Update [CLAUDE.md](./CLAUDE.md) (page store is `.page.md`; stale PLAN.md ref).
