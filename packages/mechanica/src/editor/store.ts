import { reactive, computed, type InjectionKey } from 'vue'
import type { Block, ContentBlock, State } from '@mechanica/shared'
import {
  findBlock,
  removeBlock,
  moveBlock,
  duplicateBlock,
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
  selectedId: string | null
  readonly selected: ContentBlock | null
  readonly selectedSchema: Record<string, any> | null
  select(id: string | null): void
  addBlock(blockId: string): void
  addBlockAt(blockId: string, drop: DropPosition): void
  remove(id: string): void
  move(id: string, delta: number): void
  relocate(id: string, drop: DropPosition): void
  duplicate(id: string): void
}

export const editorStoreKey: InjectionKey<EditorStore> = Symbol('mech-editor')

/** Build the reactive editor store from the initial page state and block set. */
export function createEditorStore(initial: State, components: BlockComponent[]): EditorStore {
  const blocks = components.map(toBlockMeta).filter((block) => !block.hidden)
  const blocksById = new Map(blocks.map((block) => [block.id, block]))

  const content = reactive<ContentBlock[]>((initial.content as ContentBlock[]) ?? [])
  const data = reactive<Record<string, unknown>>((initial.data as Record<string, unknown>) ?? {})
  const ui = reactive({ selectedId: null as string | null })

  const selected = computed(() => (ui.selectedId ? findBlock(content, ui.selectedId) : null))
  const selectedSchema = computed(() =>
    selected.value ? (blocksById.get(selected.value.blockId)?.props as Record<string, any>) ?? null : null,
  )

  const store = reactive({
    content,
    data,
    blocks,
    blocksById,
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
  })

  return store as unknown as EditorStore
}
