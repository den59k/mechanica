import { reactive, computed, markRaw, type InjectionKey } from 'vue'
import {
  getDefaultValue,
  type Block,
  type ContentBlock,
  type DataEntry,
  type DataScope,
  type State,
} from '@mechanica/shared'
import {
  findBlock,
  removeBlock,
  moveBlock,
  duplicateBlock,
  cloneBlock,
  placeBlock,
  relocateBlock,
  type DropPosition,
} from './content-tree'
import { toBlockMeta, createContentBlock, type BlockComponent } from './block-meta'

/** The editable, undo-able slice of state (content + the three data scope buckets). */
export interface EditableState {
  content: ContentBlock[]
  siteData: Record<string, unknown>
  folderData: Record<string, unknown>
  pageData: Record<string, unknown>
}

export interface EditorStore {
  content: ContentBlock[]
  /** Data scope buckets. A value may exist in several at once (page overrides folder overrides site). */
  siteData: Record<string, unknown>
  folderData: Record<string, unknown>
  pageData: Record<string, unknown>
  blocks: Block[]
  blocksById: Map<string, Block>
  /** The live block components keyed by id, for rendering hover previews. */
  componentsById: Map<string, BlockComponent>
  /** Editable `defineData` entries. */
  dataEntries: DataEntry[]
  /** Whether the current page lives in a folder (so folder scope is offered). */
  canFolder: boolean
  selectedId: string | null
  /** The block currently hovered on *either* surface (page or tree), kept in sync. */
  hoverId: string | null
  setHover(id: string | null): void
  readonly selected: ContentBlock | null
  readonly selectedSchema: Record<string, any> | null
  /** Effective data per entry (site < folder < page, defaults filled) — for live preview. */
  readonly effective: Record<string, unknown>
  /** The scope an entry currently resolves from on this page (defaults to `page`). */
  scopeOf(id: string): DataScope
  /** Move an entry's value to a scope: narrower = override (keep broader), broader = use that level. */
  setScope(id: string, scope: DataScope): void
  /** The object the form edits — the value at the entry's current scope (seeded when empty). */
  dataValue(id: string): Record<string, unknown>
  select(id: string | null): void
  addBlock(blockId: string): void
  addBlockAt(blockId: string, drop: DropPosition): void
  remove(id: string): void
  move(id: string, delta: number): void
  relocate(id: string, drop: DropPosition): void
  duplicate(id: string): void
  copy(id: string): void
  cut(id: string): void
  paste(afterId: string | null): void
  /** Clone the editable state (for history). */
  snapshot(): EditableState
  replace(snapshot: EditableState): void
}

export const editorStoreKey: InjectionKey<EditorStore> = Symbol('mech-editor')

/** Build the reactive editor store from the initial page state and block set. */
export function createEditorStore(
  initial: State,
  components: BlockComponent[],
  entries: DataEntry[] = [],
): EditorStore {
  const blocks = components.map(toBlockMeta).filter((block) => !block.hidden)
  const blocksById = new Map(blocks.map((block) => [block.id, block]))
  // Keep the raw components so the palette can mount live previews. `markRaw`
  // keeps Vue from proxying them — they're rendered as components, not data.
  const componentsById = markRaw(
    new Map(components.map((component) => [component.blockId ?? component.__name ?? 'block', markRaw(component)])),
  )
  const dataEntries = [...entries].sort(compareDataEntries)

  // Clone the incoming state so the editor owns it outright (see the typing-flicker
  // note: the runtime mutates window.state in place via the bridge).
  const content = reactive<ContentBlock[]>(clone(initial.content) ?? [])
  const siteData = reactive<Record<string, unknown>>(clone(initial.siteData) ?? {})
  const folderData = reactive<Record<string, unknown>>(clone(initial.folderData) ?? {})
  const pageData = reactive<Record<string, unknown>>(clone(initial.pageData) ?? {})
  const ui = reactive({
    selectedId: null as string | null,
    hoverId: null as string | null,
    clipboard: null as ContentBlock | null,
  })

  const buckets: Record<DataScope, Record<string, unknown>> = { site: siteData, folder: folderData, page: pageData }

  const schemaOf = (id: string) => dataEntries.find((entry) => entry.id === id)?.props ?? emptySchema

  /** The value a page resolves for an entry: page over folder over site, else default. */
  function effectiveValue(id: string): unknown {
    const value = pageData[id] ?? folderData[id] ?? siteData[id]
    return value != null ? value : getDefaultValue(schemaOf(id))
  }

  function scopeOf(id: string): DataScope {
    if (id in pageData) return 'page'
    if (id in folderData) return 'folder'
    if (id in siteData) return 'site'
    return 'page'
  }

  function setScope(id: string, scope: DataScope): void {
    const seed = clone(effectiveValue(id))
    // Narrower scopes are overrides (keep the broader values); the chosen scope
    // is seeded from the current effective value only when it has nothing yet.
    if (scope === 'page') {
      if (pageData[id] == null) pageData[id] = seed
    } else if (scope === 'folder') {
      delete pageData[id]
      if (folderData[id] == null) folderData[id] = seed
    } else {
      delete pageData[id]
      delete folderData[id]
      if (siteData[id] == null) siteData[id] = seed
    }
  }

  function dataValue(id: string): Record<string, unknown> {
    const bucket = buckets[scopeOf(id)]
    const current = bucket[id]
    if (current == null || typeof current !== 'object') bucket[id] = clone(effectiveValue(id))
    return bucket[id] as Record<string, unknown>
  }

  const effective = computed<Record<string, unknown>>(() =>
    Object.fromEntries(dataEntries.map((entry) => [entry.id, effectiveValue(entry.id)])),
  )

  const selected = computed(() => (ui.selectedId ? findBlock(content, ui.selectedId) : null))
  const selectedSchema = computed(() =>
    selected.value ? (blocksById.get(selected.value.blockId)?.props as Record<string, any>) ?? null : null,
  )

  const store = reactive({
    content,
    siteData,
    folderData,
    pageData,
    blocks,
    blocksById,
    componentsById,
    dataEntries,
    canFolder: initial.folder != null,
    get effective() {
      return effective.value
    },
    scopeOf,
    setScope,
    dataValue,
    get selectedId() {
      return ui.selectedId
    },
    set selectedId(value: string | null) {
      ui.selectedId = value
    },
    get hoverId() {
      return ui.hoverId
    },
    setHover(id: string | null) {
      ui.hoverId = id
    },
    selected,
    selectedSchema,

    select(id: string | null) {
      ui.selectedId = id
    },
    addBlock(blockId: string) {
      const meta = blocksById.get(blockId)
      if (!meta) return
      const block = createContentBlock(meta)
      content.push(block)
      ui.selectedId = block.id
    },
    remove(id: string) {
      removeBlock(content, id)
      if (ui.selectedId === id) ui.selectedId = null
    },
    move(id: string, delta: number) {
      moveBlock(content, id, delta)
    },
    addBlockAt(blockId: string, drop: DropPosition) {
      const meta = blocksById.get(blockId)
      if (!meta) return
      const block = createContentBlock(meta)
      placeBlock(content, block, drop)
      ui.selectedId = block.id
    },
    relocate(id: string, drop: DropPosition) {
      relocateBlock(content, id, drop)
    },
    duplicate(id: string) {
      const copy = duplicateBlock(content, id)
      if (copy) ui.selectedId = copy.id
    },
    copy(id: string) {
      const block = findBlock(content, id)
      if (block) ui.clipboard = cloneBlock(block)
    },
    cut(id: string) {
      const block = findBlock(content, id)
      if (!block) return
      ui.clipboard = cloneBlock(block)
      removeBlock(content, id)
      if (ui.selectedId === id) ui.selectedId = null
    },
    paste(afterId: string | null) {
      if (!ui.clipboard) return
      const block = cloneBlock(ui.clipboard)
      placeBlock(
        content,
        block,
        afterId ? { anchorId: afterId, position: 'after' } : { anchorId: null, position: 'after' },
      )
      ui.selectedId = block.id
    },
    snapshot(): EditableState {
      return {
        content: clone(content),
        siteData: clone(siteData),
        folderData: clone(folderData),
        pageData: clone(pageData),
      }
    },
    replace(snapshot: EditableState) {
      content.splice(0, content.length, ...(snapshot.content ?? []))
      replaceInto(siteData, snapshot.siteData)
      replaceInto(folderData, snapshot.folderData)
      replaceInto(pageData, snapshot.pageData)
      ui.selectedId = null
    },
  })

  return store as unknown as EditorStore
}

const emptySchema = { type: 'object', properties: {} }

/** Replace the contents of a reactive object in place (keeps the same reference). */
function replaceInto(target: Record<string, unknown>, source: Record<string, unknown> = {}): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, source ?? {})
}

/** Deep-clone JSON-serializable editor state, preserving `undefined`/missing input. */
function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

/** Sort data entries alphabetically by title (falling back to id). */
export function compareDataEntries(a: DataEntry, b: DataEntry): number {
  return (a.title ?? a.id).localeCompare(b.title ?? b.id)
}
