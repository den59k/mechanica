import { reactive, computed, type InjectionKey } from 'vue'
import {
  getDefaultValue,
  type Block,
  type ContentBlock,
  type DataEntry,
  type PageMeta,
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

export interface EditorStore {
  content: ContentBlock[]
  data: Record<string, unknown>
  blocks: Block[]
  blocksById: Map<string, Block>
  /** Editable `defineData` entries (site/folder/page scoped). */
  dataEntries: DataEntry[]
  /** Current page's metadata (title, description, custom meta). */
  page: PageMeta
  selectedId: string | null
  readonly selected: ContentBlock | null
  readonly selectedSchema: Record<string, any> | null
  /** Ensure an entry's value object exists in `data` and return it for editing. */
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
  replace(snapshot: { content: ContentBlock[]; data: Record<string, unknown> }): void
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
  const dataEntries = [...entries].sort(compareDataEntries)

  // Clone the incoming state so the editor owns it outright. The runtime reads
  // the same `window.state` and mutates its data in place (via the bridge's
  // mergeData); sharing those references would let a stale async echo write back
  // into a field being typed in, causing the value to flicker.
  const content = reactive<ContentBlock[]>(clone(initial.content) ?? [])
  const data = reactive<Record<string, unknown>>(clone(initial.data) ?? {})
  const page = reactive<PageMeta>(clone(initial.page) ?? {})
  if (!page.meta) page.meta = {}
  const ui = reactive({ selectedId: null as string | null, clipboard: null as ContentBlock | null })

  // Seed missing data values from their schema so the form always has an object to bind.
  for (const entry of dataEntries) {
    if (data[entry.id] == null) data[entry.id] = getDefaultValue(entry.props ?? emptySchema)
  }

  const selected = computed(() => (ui.selectedId ? findBlock(content, ui.selectedId) : null))
  const selectedSchema = computed(() =>
    selected.value ? (blocksById.get(selected.value.blockId)?.props as Record<string, any>) ?? null : null,
  )

  const store = reactive({
    content,
    data,
    page,
    blocks,
    blocksById,
    dataEntries,
    dataValue(id: string): Record<string, unknown> {
      const current = data[id]
      if (current == null || typeof current !== 'object') {
        const entry = dataEntries.find((e) => e.id === id)
        data[id] = getDefaultValue(entry?.props ?? emptySchema)
      }
      return data[id] as Record<string, unknown>
    },
    get selectedId() {
      return ui.selectedId
    },
    set selectedId(value: string | null) {
      ui.selectedId = value
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
      const clone = duplicateBlock(content, id)
      if (clone) ui.selectedId = clone.id
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
    replace(snapshot: { content: ContentBlock[]; data: Record<string, unknown> }) {
      content.splice(0, content.length, ...(snapshot.content ?? []))
      for (const key of Object.keys(data)) delete data[key]
      Object.assign(data, snapshot.data ?? {})
      ui.selectedId = null
    },
  })

  return store as unknown as EditorStore
}

const emptySchema = { type: 'object', properties: {} }

/** Deep-clone JSON-serializable editor state, preserving `undefined`/missing input. */
function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

/** Scope ordering for the data panel: broadest (site) first, page-specific last. */
const SCOPE_ORDER: Record<string, number> = { site: 0, folder: 1, page: 2 }

/** Sort data entries by scope breadth, then alphabetically by title/id. */
export function compareDataEntries(a: DataEntry, b: DataEntry): number {
  const byScope = (SCOPE_ORDER[a.scope ?? 'page'] ?? 2) - (SCOPE_ORDER[b.scope ?? 'page'] ?? 2)
  if (byScope !== 0) return byScope
  return (a.title ?? a.id).localeCompare(b.title ?? b.id)
}
