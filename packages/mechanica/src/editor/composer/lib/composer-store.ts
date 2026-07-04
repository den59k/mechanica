import { reactive } from 'vue'
import { unfoldSchema } from 'compact-json-schema'
import { buildPreviewData, type ComposedBlockDefinition, type ContentBlock } from 'mechanica-shared'
import {
  findBlock,
  removeBlock,
  moveBlock,
  duplicateBlock,
  placeBlock,
  relocateBlock,
  ensureSlotList,
  type DropPosition,
} from '../../lib/content-tree'
import { elementMeta, isContainerBlock } from './elements-meta'
import { effectiveData, type CanvasBreakpoint } from './canvas'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A snapshot of everything the composer persists / undoes. */
export type ComposerSnapshot = ComposedBlockDefinition

export interface ComposerStore {
  def: ComposedBlockDefinition
  selectedId: string | null
  breakpoint: CanvasBreakpoint
  zoom: number
  readonly template: ContentBlock[]
  readonly selected: ContentBlock | null
  /** Preview prop values for the canvas (schema defaults ← previewData). */
  readonly previewProps: Record<string, unknown>
  addElement(blockId: string): void
  select(id: string | null): void
  remove(id: string): void
  duplicate(id: string): void
  move(id: string, delta: number): void
  relocate(id: string, drop: DropPosition): void
  /** Merge `patch` into a node's data — into the current breakpoint layer when
   *  `responsive` and a non-base breakpoint is active, else the base. */
  setData(id: string, patch: Record<string, unknown>, opts?: { responsive?: boolean }): void
  /** The effective value of a data key at the current breakpoint. */
  effective(node: ContentBlock, key: string): unknown
  /** Whether the current (non-base) breakpoint overrides this key. */
  isOverridden(node: ContentBlock, key: string): boolean
  /** Drop the current breakpoint's override for a key (revert to inherited). */
  clearOverride(id: string, key: string): void
  setMeta(patch: Partial<Pick<ComposedBlockDefinition, 'name' | 'icon' | 'category'>>): void
  snapshot(): ComposerSnapshot
  replace(next: ComposerSnapshot): void
}

/** Create the reactive editor store for one composed block. */
export function createComposerStore(initial: ComposedBlockDefinition): ComposerStore {
  const store = reactive({
    def: clone(initial),
    selectedId: null as string | null,
    breakpoint: 'base' as CanvasBreakpoint,
    zoom: 1,

    get template(): ContentBlock[] {
      return this.def.template
    },
    get selected(): ContentBlock | null {
      return this.selectedId ? findBlock(this.def.template, this.selectedId) : null
    },
    get previewProps(): Record<string, unknown> {
      const props = this.def.props ? (unfoldSchema(this.def.props as never) as Record<string, unknown>) : undefined
      return buildPreviewData(props, this.def.previewData)
    },

    addElement(blockId: string) {
      const meta = elementMeta(blockId)
      if (!meta) return
      const node = meta.create()
      const sel = this.selected
      if (sel && isContainerBlock(sel.blockId)) ensureSlotList(sel).push(node)
      else if (sel) placeBlock(this.def.template, node, { anchorId: sel.id, position: 'after' })
      else this.def.template.push(node)
      this.selectedId = node.id
    },
    select(id: string | null) {
      this.selectedId = id
    },
    remove(id: string) {
      removeBlock(this.def.template, id)
      if (this.selectedId === id) this.selectedId = null
    },
    duplicate(id: string) {
      const copy = duplicateBlock(this.def.template, id)
      if (copy) this.selectedId = copy.id
    },
    move(id: string, delta: number) {
      moveBlock(this.def.template, id, delta)
    },
    relocate(id: string, drop: DropPosition) {
      relocateBlock(this.def.template, id, drop)
    },

    setData(id: string, patch: Record<string, unknown>, opts?: { responsive?: boolean }) {
      const node = findBlock(this.def.template, id)
      if (!node) return
      const responsive = !!opts?.responsive && this.breakpoint !== 'base'
      let target: Record<string, unknown> = node.data
      if (responsive) {
        const bp = (node.data.$bp ??= {}) as Record<string, Record<string, unknown>>
        target = bp[this.breakpoint] ??= {}
      }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete target[key]
        else target[key] = value
      }
    },
    effective(node: ContentBlock, key: string): unknown {
      return effectiveData(node, this.breakpoint)[key]
    },
    isOverridden(node: ContentBlock, key: string): boolean {
      if (this.breakpoint === 'base') return false
      const bp = (node.data.$bp as Record<string, unknown> | undefined)?.[this.breakpoint]
      return isObject(bp) && key in bp
    },
    clearOverride(id: string, key: string) {
      if (this.breakpoint === 'base') return
      const node = findBlock(this.def.template, id)
      const layer = (node?.data.$bp as Record<string, Record<string, unknown>> | undefined)?.[this.breakpoint]
      if (layer) delete layer[key]
    },

    setMeta(patch: Partial<Pick<ComposedBlockDefinition, 'name' | 'icon' | 'category'>>) {
      if (patch.name !== undefined) this.def.name = patch.name
      if (patch.icon !== undefined) this.def.icon = patch.icon
      if (patch.category !== undefined) this.def.category = patch.category
    },

    snapshot(): ComposerSnapshot {
      return clone(this.def)
    },
    replace(next: ComposerSnapshot) {
      this.def = clone(next)
      if (this.selectedId && !findBlock(this.def.template, this.selectedId)) this.selectedId = null
    },
  })

  return store as unknown as ComposerStore
}
