import { reactive } from 'vue'
import { unfoldSchema } from 'compact-json-schema'
import {
  buildPreviewData,
  isBinding,
  walkTree,
  type ComposedBlockDefinition,
  type ContentBlock,
} from 'mechanica-shared'
import {
  findBlock,
  findParentSlot,
  removeBlock,
  moveBlock,
  duplicateBlock,
  placeBlock,
  relocateBlock,
  ensureSlotList,
  type DropPosition,
} from '../../lib/content-tree'
import { humanize } from '../../props-panel/humanize'
import { isContainerBlock, type InsertItem } from './elements-meta'
import { normalizeTemplate } from './normalize-template'
import { effectiveData, type CanvasBreakpoint } from './canvas'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A snapshot of everything the composer persists / undoes. */
export type ComposerSnapshot = ComposedBlockDefinition

export interface ComposerStore {
  def: ComposedBlockDefinition
  /** Every selected element id (multi-select). The last is the "primary". */
  selectedIds: string[]
  /** The primary selection (last-clicked) — drives the inspector. Read-only; write via `select`. */
  readonly selectedId: string | null
  breakpoint: CanvasBreakpoint
  /** Canvas view: zoom factor and pan offset (screen px). View state, not persisted. */
  zoom: number
  panX: number
  panY: number
  /** Measured on-canvas size of the selected node (from the overlay). View state. */
  measured: { w: number; h: number } | null
  readonly template: ContentBlock[]
  /** The canonical root frame (the block itself) — always present. */
  readonly rootFrame: ContentBlock
  readonly rootId: string
  /** The primary selected node (last-clicked). */
  readonly selected: ContentBlock | null
  /** Every selected node, in selection order (missing ids filtered out). */
  readonly selectedNodes: ContentBlock[]
  /** Preview prop values for the canvas (schema defaults ← previewData). */
  readonly previewProps: Record<string, unknown>
  /** Create + insert a fresh element from a palette insert item (Row/Column/Text/Image). */
  insertItem(item: InsertItem): void
  /** Insert a pre-built node (a component, a pasted subtree) at the selection. */
  insertNode(node: ContentBlock): void
  /** Insert a pre-built node at an explicit drop position (drag-to-canvas). */
  insertAt(node: ContentBlock, drop: DropPosition): void
  /** Select `id` (replacing the selection), or clear with `null`. `additive`
   *  toggles `id` in/out of the current multi-selection. */
  select(id: string | null, additive?: boolean): void
  /** Replace the whole selection at once (marquee / range select). */
  selectMany(ids: string[]): void
  /** Whether `id` is part of the current selection. */
  isSelected(id: string): boolean
  /** Collapse a multi-selection to the primary, then walk up: child → parent → root → none (Esc). */
  selectUp(): void
  remove(id: string): void
  /** Remove every selected element (skips the root). */
  removeSelected(): void
  duplicate(id: string): void
  /** Duplicate every selected element; the copies become the new selection. */
  duplicateSelected(): void
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
  /** Toggle absolute placement (`$abs`) for a node. */
  setAbsolute(id: string, on: boolean): void
  /** Merge into a node's absolute-placement config. */
  setAbs(id: string, patch: Record<string, unknown>): void
  setMeta(patch: Partial<Pick<ComposedBlockDefinition, 'name' | 'icon' | 'category'>>): void
  // ── Prop exposure (parameterization) ──────────────────────────────
  /** The prop a node's field is bound to, or null. Bindings live on base data. */
  boundPropOf(nodeId: string, key: string): string | null
  /** Bind a field to a prop: replace its value with `{ $bind }`, add the prop
   *  schema (default = current value) + previewData. Returns the prop name. */
  exposeProp(nodeId: string, key: string, schema: Record<string, unknown>, name?: string): string | null
  /** Unbind a prop everywhere it's used, restoring the previewData value. */
  unexposeProp(propName: string): void
  /** Rename an exposed prop (updates every binding + the schema/previewData). */
  renameProp(from: string, to: string): boolean
  /** Set an exposed prop's default (schema default + previewData). */
  setPropDefault(propName: string, value: unknown): void
  /** The exposed props in declared order. */
  readonly props: { name: string; schema: Record<string, unknown> }[]
  snapshot(): ComposerSnapshot
  replace(next: ComposerSnapshot): void
}

/** A unique prop name derived from `base`, avoiding the keys already in `props`. */
function uniquePropName(base: string, props: Record<string, unknown>): string {
  const clean = base.replace(/[^a-zA-Z0-9]+/g, '') || 'prop'
  if (!(clean in props)) return clean
  for (let n = 2; ; n++) if (!(`${clean}${n}` in props)) return `${clean}${n}`
}

/** Replace every `{ $bind: propName }` in a node's data (base, `$bp` layers, `$if`). */
function replaceBinding(
  node: ContentBlock,
  propName: string,
  replace: (binding: unknown) => unknown,
): void {
  const visit = (obj: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (isBinding(value) && value.$bind === propName) obj[key] = replace(value)
    }
  }
  visit(node.data)
  const bp = node.data.$bp
  if (bp && typeof bp === 'object') {
    for (const layer of Object.values(bp as Record<string, unknown>)) {
      if (layer && typeof layer === 'object') visit(layer as Record<string, unknown>)
    }
  }
}

/** Deep-clone a definition and enforce the root-frame invariant. */
function normalizedClone(def: ComposedBlockDefinition): ComposedBlockDefinition {
  const c = clone(def)
  c.template = normalizeTemplate(c.template ?? [])
  return c
}

/** Create the reactive editor store for one composed block. */
export function createComposerStore(initial: ComposedBlockDefinition): ComposerStore {
  const store = reactive({
    def: normalizedClone(initial),
    selectedIds: [] as string[],
    breakpoint: 'base' as CanvasBreakpoint,
    zoom: 1,
    panX: 0,
    panY: 0,
    measured: null as { w: number; h: number } | null,

    get template(): ContentBlock[] {
      return this.def.template
    },
    get rootFrame(): ContentBlock {
      return this.def.template[0]!
    },
    get rootId(): string {
      return this.def.template[0]!.id
    },
    get selectedId(): string | null {
      return this.selectedIds[this.selectedIds.length - 1] ?? null
    },
    get selected(): ContentBlock | null {
      const id = this.selectedId
      return id ? findBlock(this.def.template, id) : null
    },
    get selectedNodes(): ContentBlock[] {
      return this.selectedIds
        .map((id) => findBlock(this.def.template, id))
        .filter((n): n is ContentBlock => n != null)
    },
    /** Coerce a drop so it can never spawn a second top-level node beside root. */
    rootSafeDrop(drop: DropPosition): DropPosition {
      if (drop.anchorId === null || (drop.anchorId === this.rootId && drop.position !== 'inside')) {
        return { anchorId: this.rootId, position: 'inside' }
      }
      return drop
    },
    get previewProps(): Record<string, unknown> {
      const props = this.def.props ? (unfoldSchema(this.def.props as never) as Record<string, unknown>) : undefined
      return buildPreviewData(props, this.def.previewData)
    },

    insertItem(item: InsertItem) {
      this.insertNode(item.create())
    },
    insertNode(node: ContentBlock) {
      const sel = this.selected
      if (sel && isContainerBlock(sel.blockId)) ensureSlotList(sel).push(node)
      else if (sel) placeBlock(this.def.template, node, { anchorId: sel.id, position: 'after' })
      // No selection → drop into the root frame, never beside it.
      else ensureSlotList(this.rootFrame).push(node)
      this.selectedIds = [node.id]
    },
    insertAt(node: ContentBlock, drop: DropPosition) {
      placeBlock(this.def.template, node, this.rootSafeDrop(drop))
      this.selectedIds = [node.id]
    },
    select(id: string | null, additive = false) {
      if (id === null) {
        this.selectedIds = []
      } else if (additive) {
        this.selectedIds = this.isSelected(id)
          ? this.selectedIds.filter((x) => x !== id) // toggle off
          : [...this.selectedIds, id] // add (and become primary)
      } else {
        this.selectedIds = [id]
      }
    },
    selectMany(ids: string[]) {
      this.selectedIds = [...ids]
    },
    isSelected(id: string): boolean {
      return this.selectedIds.includes(id)
    },
    selectUp() {
      // First Esc on a multi-selection narrows to the primary; the next climbs.
      if (this.selectedIds.length > 1) {
        this.selectedIds = [this.selectedId!]
        return
      }
      const id = this.selectedId
      if (!id) return
      const parent = findParentSlot(this.def.template, id)
      this.selectedIds = parent ? [parent.parent.id] : []
    },
    remove(id: string) {
      if (id === this.rootId) return // the root frame is permanent
      removeBlock(this.def.template, id)
      this.selectedIds = this.selectedIds.filter((x) => x !== id)
    },
    removeSelected() {
      const ids = this.selectedIds.filter((id) => id !== this.rootId)
      for (const id of ids) removeBlock(this.def.template, id)
      this.selectedIds = []
    },
    duplicate(id: string) {
      if (id === this.rootId) return // duplicating the block itself is meaningless
      const copy = duplicateBlock(this.def.template, id)
      if (copy) this.selectedIds = [copy.id]
    },
    duplicateSelected() {
      const copies: string[] = []
      for (const id of this.selectedIds) {
        if (id === this.rootId) continue
        const copy = duplicateBlock(this.def.template, id)
        if (copy) copies.push(copy.id)
      }
      if (copies.length) this.selectedIds = copies
    },
    move(id: string, delta: number) {
      moveBlock(this.def.template, id, delta)
    },
    relocate(id: string, drop: DropPosition) {
      if (id === this.rootId) return // the root never relocates
      relocateBlock(this.def.template, id, this.rootSafeDrop(drop))
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
    setAbsolute(id: string, on: boolean) {
      const node = findBlock(this.def.template, id)
      if (!node) return
      if (on) node.data.$abs = { anchor: 'top-left', x: 0, y: 0 }
      else delete node.data.$abs
    },
    setAbs(id: string, patch: Record<string, unknown>) {
      const node = findBlock(this.def.template, id)
      if (!node) return
      const abs = (node.data.$abs ??= { anchor: 'top-left', x: 0, y: 0 }) as Record<string, unknown>
      Object.assign(abs, patch)
    },

    setMeta(patch: Partial<Pick<ComposedBlockDefinition, 'name' | 'icon' | 'category'>>) {
      if (patch.name !== undefined) this.def.name = patch.name
      if (patch.icon !== undefined) this.def.icon = patch.icon || undefined
      // An empty category clears the key (falls back to "Site blocks"), rather
      // than grouping the block under a blank palette heading.
      if (patch.category !== undefined) {
        if (patch.category) this.def.category = patch.category
        else delete this.def.category
      }
    },

    boundPropOf(nodeId: string, key: string): string | null {
      const node = findBlock(this.def.template, nodeId)
      const value = node?.data[key]
      return isBinding(value) ? value.$bind : null
    },
    exposeProp(nodeId: string, key: string, schema: Record<string, unknown>, name?: string): string | null {
      const node = findBlock(this.def.template, nodeId)
      if (!node) return null
      const current = node.data[key]
      if (isBinding(current)) return current.$bind // already bound
      const props = (this.def.props ??= {}) as Record<string, unknown>
      const propName = uniquePropName(name || key, props)
      props[propName] = { ...schema, title: humanize(propName), default: current }
      const preview = (this.def.previewData ??= {}) as Record<string, unknown>
      preview[propName] = current
      node.data[key] = { $bind: propName }
      return propName
    },
    unexposeProp(propName: string) {
      const fallback = (this.def.previewData as Record<string, unknown> | undefined)?.[propName]
      walkTree(this.def.template, (node) => replaceBinding(node, propName, () => fallback))
      if (this.def.props) delete (this.def.props as Record<string, unknown>)[propName]
      if (this.def.previewData) delete (this.def.previewData as Record<string, unknown>)[propName]
    },
    renameProp(from: string, to: string): boolean {
      const clean = to.replace(/[^a-zA-Z0-9]+/g, '')
      const props = this.def.props as Record<string, unknown> | undefined
      if (!clean || !props || !(from in props) || (clean !== from && clean in props)) return false
      if (clean === from) return true
      walkTree(this.def.template, (node) => replaceBinding(node, from, () => ({ $bind: clean })))
      props[clean] = { ...(props[from] as Record<string, unknown>), title: humanize(clean) }
      delete props[from]
      const preview = this.def.previewData as Record<string, unknown> | undefined
      if (preview && from in preview) {
        preview[clean] = preview[from]
        delete preview[from]
      }
      return true
    },
    setPropDefault(propName: string, value: unknown) {
      const props = this.def.props as Record<string, Record<string, unknown>> | undefined
      if (props?.[propName]) props[propName].default = value
      const preview = (this.def.previewData ??= {}) as Record<string, unknown>
      preview[propName] = value
    },
    get props(): { name: string; schema: Record<string, unknown> }[] {
      const props = (this.def.props ?? {}) as Record<string, Record<string, unknown>>
      return Object.entries(props).map(([name, schema]) => ({ name, schema }))
    },

    snapshot(): ComposerSnapshot {
      return clone(this.def)
    },
    replace(next: ComposerSnapshot) {
      this.def = normalizedClone(next)
      // Drop any selected ids that no longer exist (undo/redo across deletes).
      this.selectedIds = this.selectedIds.filter((id) => findBlock(this.def.template, id))
    },
  })

  return store as unknown as ComposerStore
}
