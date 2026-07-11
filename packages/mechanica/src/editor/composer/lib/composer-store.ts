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
  findParentList,
  removeBlock,
  moveBlock,
  duplicateBlock,
  placeBlock,
  relocateBlock,
  ensureSlotList,
  uid,
  type DropPosition,
} from '../../lib/content-tree'
import { humanize } from '../../props-panel/humanize'
import { isContainerBlock, elementKind, type InsertItem } from './elements-meta'
import { optionalProp, propPresent } from './inspector-props'
import { normalizeTemplate } from './normalize-template'
import { setClipboard, readClipboard } from './clipboard'
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
  /** The spacing/placement control the inspector is touching (hover/edit), for the
   *  canvas to echo: a padding/margin `side`, `gap` (frame-wide), or `position` (the
   *  `$abs` align-point guide). `symmetric` (Alt) also lights the opposite side.
   *  View state — not saved. */
  spacing: { prop: 'padding' | 'margin' | 'gap' | 'position'; side?: 't' | 'r' | 'b' | 'l'; symmetric?: boolean } | null
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
  /** Whether the selection can be grouped: ≥1 non-root element sharing one parent slot. */
  readonly canGroup: boolean
  /** Whether the single selected element is a frame with children (ungroupable). */
  readonly canUngroup: boolean
  /** Wrap the selection in a new frame, in place and in document order; selects it. */
  group(): void
  /** Lift the selected frame's children into its parent, dropping the frame; selects them. */
  ungroup(): void
  /** Copy the selection to the composer clipboard (the root can't be copied). */
  copySelection(): void
  /** Copy the selection, then delete it. */
  cutSelection(): void
  /** Paste the clipboard: into a selected container, after a selected leaf, else the root. */
  paste(): void
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
  // ── Optional inspector properties (the Properties switches) ────────
  /** Whether a property is active: its data keys exist (any layer) or it was
   *  switched on this session. */
  hasProp(node: ContentBlock, key: string): boolean
  /** Switch a property on. View-state only — no data is written until the user
   *  edits a value (`position` is the exception: being on *is* data). */
  addProp(id: string, key: string): void
  /** Switch a property off and delete its data keys from the base + every `$bp` layer. */
  removeProp(id: string, key: string): void
  setMeta(patch: Partial<Pick<ComposedBlockDefinition, 'name' | 'icon' | 'category' | 'hidden' | 'standalone'>>): void
  // ── Prop exposure (parameterization) ──────────────────────────────
  /** The prop a node's field is bound to, or null. Bindings live on base data. */
  boundPropOf(nodeId: string, key: string): string | null
  /** Bind a field to a prop: replace its value with `{ $bind }`, add the prop
   *  schema (default = current value) + previewData. Inside a repeated (`$each`)
   *  subtree the field becomes a per-item field (`$bind: '$item.<name>'`) on the
   *  repeat's array prop instead. Returns the binding name. */
  exposeProp(nodeId: string, key: string, schema: Record<string, unknown>, name?: string): string | null
  /** Unbind a prop everywhere it's used, restoring the previewData value. */
  unexposeProp(propName: string): void
  /** Unbind one field, item-binding-aware (the ⚡ chip's ✕). A `$item.*` binding
   *  restores the first preview item's value and drops the item field when no
   *  other field in the repeat scope still binds it; a plain prop binding
   *  delegates to {@link unexposeProp}. */
  unbindField(nodeId: string, key: string): void
  // ── Repeat ($each) ─────────────────────────────────────────────────
  /** The `$each` array-prop name a node repeats over, or null. */
  eachPropOf(node: ContentBlock): string | null
  /** Turn repetition on/off. On: creates an array prop (+ 3 preview items) and
   *  marks the node `$each`. Off: restores `$item.*` bindings in the subtree to
   *  the first preview item's values and drops the prop (unless another node
   *  still repeats over it). */
  setEach(id: string, on: boolean): void
  /** Resize the repeat's preview list (clones the last item to grow). */
  setEachCount(id: string, count: number): void
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
  visitDataLayers(node, (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (isBinding(value) && value.$bind === propName) obj[key] = replace(value)
    }
  })
}

/** Deep-clone a definition and enforce the root-frame invariant. */
function normalizedClone(def: ComposedBlockDefinition): ComposedBlockDefinition {
  const c = clone(def)
  c.template = normalizeTemplate(c.template ?? [])
  return c
}

/** A `$item` / `$item.field` binding name → the field name ('' for the whole item). */
function itemFieldOf(name: string): string | null {
  if (name === '$item') return ''
  return name.startsWith('$item.') ? name.slice('$item.'.length) : null
}

/**
 * Walk a repeat scope: the `$each` node's subtree, *skipping* nested nodes that
 * declare their own `$each` (their `$item` bindings belong to the inner scope).
 */
function walkEachScope(root: ContentBlock, visit: (node: ContentBlock) => void): void {
  const walk = (node: ContentBlock, isRoot: boolean): void => {
    if (!isRoot && typeof node.data?.$each === 'string') return
    visit(node)
    const children = node.children
    if (!children) return
    const lists = Array.isArray(children) ? [children] : Object.values(children)
    for (const list of lists) for (const child of list) walk(child, false)
  }
  walk(root, true)
}

/** Visit every data layer (base + `$bp` overrides) of a node. */
function visitDataLayers(node: ContentBlock, visit: (obj: Record<string, unknown>) => void): void {
  visit(node.data)
  const bp = node.data.$bp
  if (bp && typeof bp === 'object') {
    for (const layer of Object.values(bp as Record<string, unknown>)) {
      if (layer && typeof layer === 'object') visit(layer as Record<string, unknown>)
    }
  }
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
    spacing: null as { prop: 'padding' | 'margin' | 'gap' | 'position'; side?: 't' | 'r' | 'b' | 'l'; symmetric?: boolean } | null,
    /** Optional-property rows added this session with no data yet (view state,
     *  keyed by node id) — union'd with data presence by `hasProp`. */
    addedProps: {} as Record<string, string[]>,

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
    get canGroup(): boolean {
      const ids = this.selectedIds.filter((id) => id !== this.rootId)
      if (!ids.length) return false
      const first = findParentSlot(this.def.template, ids[0]!)
      if (!first) return false
      return ids.every((id) => {
        const ps = findParentSlot(this.def.template, id)
        return !!ps && ps.parent === first.parent && ps.slot === first.slot
      })
    },
    get canUngroup(): boolean {
      const node = this.selected
      return (
        !!node &&
        node.id !== this.rootId &&
        this.selectedIds.length === 1 &&
        elementKind(node.blockId) === 'frame' &&
        Array.isArray(node.children) &&
        node.children.length > 0
      )
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
    group() {
      const ids = this.selectedIds.filter((id) => id !== this.rootId)
      if (!ids.length) return
      const first = findParentSlot(this.def.template, ids[0]!)
      if (!first) return
      // Every selected element must sit in the same parent slot to group cleanly.
      const selected = new Set(ids)
      const sameParent = [...selected].every((id) => {
        const ps = findParentSlot(this.def.template, id)
        return !!ps && ps.parent === first.parent && ps.slot === first.slot
      })
      if (!sameParent) return

      const list = ensureSlotList(first.parent, first.slot)
      const insertIndex = list.findIndex((c) => selected.has(c.id))
      if (insertIndex < 0) return
      const members = list.filter((c) => selected.has(c.id)) // document order
      for (let i = list.length - 1; i >= 0; i--) if (selected.has(list[i]!.id)) list.splice(i, 1)

      // The wrapper inherits the parent's flow direction so nothing reflows sideways.
      const direction = first.parent.data.direction === 'row' ? 'row' : 'column'
      const frame: ContentBlock = {
        id: uid(),
        blockId: 'mech:frame',
        data: { direction, gap: 16, padding: 0 },
        children: members,
      }
      list.splice(insertIndex, 0, frame)
      this.selectedIds = [frame.id]
    },
    ungroup() {
      const node = this.selected
      if (!node || node.id === this.rootId || elementKind(node.blockId) !== 'frame') return
      if (!Array.isArray(node.children) || !node.children.length) return
      const found = findParentList(this.def.template, node.id)
      if (!found) return
      const lifted = [...node.children]
      found.list.splice(found.index, 1, ...lifted) // replace the frame with its children
      this.selectedIds = lifted.map((k) => k.id)
    },
    copySelection() {
      const nodes = this.selectedNodes.filter((n) => n.id !== this.rootId)
      if (nodes.length) setClipboard(nodes)
    },
    cutSelection() {
      this.copySelection()
      this.removeSelected()
    },
    paste() {
      const nodes = readClipboard()
      if (!nodes.length) return
      // Nudge absolutely-placed pastes so they don't land exactly on the original.
      for (const node of nodes) {
        const abs = node.data.$abs
        if (isObject(abs)) {
          if (typeof abs.x === 'number') abs.x += 10
          if (typeof abs.y === 'number') abs.y += 10
        }
      }
      const sel = this.selected
      const ids: string[] = []
      if (sel && isContainerBlock(sel.blockId)) {
        // A selected frame (incl. the root) receives the paste inside it.
        const list = ensureSlotList(sel)
        for (const node of nodes) {
          list.push(node)
          ids.push(node.id)
        }
      } else if (sel && sel.id !== this.rootId) {
        // A selected leaf: paste after it, preserving order.
        let anchorId = sel.id
        for (const node of nodes) {
          placeBlock(this.def.template, node, { anchorId, position: 'after' })
          anchorId = node.id
          ids.push(node.id)
        }
      } else {
        const list = ensureSlotList(this.rootFrame)
        for (const node of nodes) {
          list.push(node)
          ids.push(node.id)
        }
      }
      this.selectedIds = ids
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

    hasProp(node: ContentBlock, key: string): boolean {
      const prop = optionalProp(key)
      if (!prop) return false
      return propPresent(node, prop) || !!this.addedProps[node.id]?.includes(key)
    },
    addProp(id: string, key: string) {
      // Position's "on" state is the `$abs` object itself, so adding it writes data.
      if (key === 'position') return this.setAbsolute(id, true)
      // Repeat's "on" state is the `$each` key + its array prop — bookkept by setEach.
      if (key === 'repeat') return this.setEach(id, true)
      const list = (this.addedProps[id] ??= [])
      if (!list.includes(key)) list.push(key)
    },
    removeProp(id: string, key: string) {
      // Repeat off must restore $item bindings + drop the array prop, not just
      // delete the `$each` key — route through setEach.
      if (key === 'repeat') return this.setEach(id, false)
      const prop = optionalProp(key)
      const node = findBlock(this.def.template, id)
      if (!prop || !node) return
      for (const dataKey of prop.dataKeys) {
        delete node.data[dataKey]
        const bp = node.data.$bp
        if (isObject(bp)) {
          for (const layer of Object.values(bp)) if (isObject(layer)) delete layer[dataKey]
        }
      }
      const list = this.addedProps[id]
      if (list) this.addedProps[id] = list.filter((k) => k !== key)
    },

    setMeta(patch: Partial<Pick<ComposedBlockDefinition, 'name' | 'icon' | 'category' | 'hidden' | 'standalone'>>) {
      if (patch.name !== undefined) this.def.name = patch.name
      if (patch.icon !== undefined) this.def.icon = patch.icon || undefined
      // An empty category clears the key (falls back to "Site blocks"), rather
      // than grouping the block under a blank palette heading.
      if (patch.category !== undefined) {
        if (patch.category) this.def.category = patch.category
        else delete this.def.category
      }
      // Palette visibility / whole-page flag: only `true` persists (files stay clean).
      if (patch.hidden !== undefined) {
        if (patch.hidden) this.def.hidden = true
        else delete this.def.hidden
      }
      if (patch.standalone !== undefined) {
        if (patch.standalone) this.def.standalone = true
        else delete this.def.standalone
      }
    },

    boundPropOf(nodeId: string, key: string): string | null {
      const node = findBlock(this.def.template, nodeId)
      const value = node?.data[key]
      return isBinding(value) ? value.$bind : null
    },
    /** The nearest `$each` node covering `nodeId` (itself included), or null. */
    eachScopeOf(nodeId: string): { node: ContentBlock; propName: string } | null {
      let current = findBlock(this.def.template, nodeId)
      while (current) {
        const each = current.data?.$each
        if (typeof each === 'string') return { node: current, propName: each }
        const parent = findParentSlot(this.def.template, current.id)
        current = parent?.parent ?? null
      }
      return null
    },
    /** The repeat's array prop schema, normalized to `{ items: { properties } }`. */
    eachItemsSchema(propName: string): Record<string, unknown> {
      const props = (this.def.props ??= {}) as Record<string, Record<string, unknown>>
      const arr = (props[propName] ??= { type: 'array', title: humanize(propName) })
      const items = (arr.items ??= { type: 'object', properties: {} }) as Record<string, unknown>
      items.properties ??= {}
      return items.properties as Record<string, unknown>
    },
    /** The repeat's preview items (created on demand so binding always lands). */
    eachPreviewItems(propName: string): Record<string, unknown>[] {
      const preview = (this.def.previewData ??= {}) as Record<string, unknown>
      if (!Array.isArray(preview[propName]) || !(preview[propName] as unknown[]).length) {
        preview[propName] = [{}, {}, {}]
      }
      const list = preview[propName] as unknown[]
      for (let i = 0; i < list.length; i++) if (!isObject(list[i])) list[i] = {}
      return list as Record<string, unknown>[]
    },
    /** Mirror the preview items into the array prop's default, so a freshly
     *  placed instance starts with the example items. */
    syncEachDefault(propName: string) {
      const props = this.def.props as Record<string, Record<string, unknown>> | undefined
      const preview = (this.def.previewData as Record<string, unknown> | undefined)?.[propName]
      if (props?.[propName] && Array.isArray(preview)) props[propName].default = clone(preview)
    },
    exposeProp(nodeId: string, key: string, schema: Record<string, unknown>, name?: string): string | null {
      const node = findBlock(this.def.template, nodeId)
      if (!node) return null
      const current = node.data[key]
      if (isBinding(current)) return current.$bind // already bound

      // Inside a repeated subtree, the field becomes a per-item field of the
      // repeat's array prop: `$bind: '$item.<field>'`, schema on `items`, and
      // the current value seeds every preview item.
      const scope = this.eachScopeOf(nodeId)
      if (scope) {
        const fields = this.eachItemsSchema(scope.propName)
        const fieldName = uniquePropName(name || key, fields)
        fields[fieldName] = { ...schema, title: humanize(fieldName) }
        for (const item of this.eachPreviewItems(scope.propName)) {
          if (!(fieldName in item)) item[fieldName] = clone(current)
        }
        this.syncEachDefault(scope.propName)
        node.data[key] = { $bind: `$item.${fieldName}` }
        return `$item.${fieldName}`
      }

      const props = (this.def.props ??= {}) as Record<string, unknown>
      const propName = uniquePropName(name || key, props)
      props[propName] = { ...schema, title: humanize(propName), default: current }
      const preview = (this.def.previewData ??= {}) as Record<string, unknown>
      preview[propName] = current
      node.data[key] = { $bind: propName }
      return propName
    },
    unbindField(nodeId: string, key: string) {
      const node = findBlock(this.def.template, nodeId)
      const value = node?.data[key]
      if (!node || !isBinding(value)) return
      const field = itemFieldOf(value.$bind)
      if (field === null) return this.unexposeProp(value.$bind)

      const scope = this.eachScopeOf(nodeId)
      const items = scope ? this.eachPreviewItems(scope.propName) : []
      const first = items[0] ?? {}
      const fallback = field === '' ? first : first[field]
      if (fallback === undefined) delete node.data[key]
      else node.data[key] = clone(fallback)

      // Drop the item field when nothing else in this repeat scope binds it.
      if (!scope || field === '') return
      let stillUsed = false
      walkEachScope(scope.node, (n) =>
        visitDataLayers(n, (obj) => {
          for (const v of Object.values(obj)) {
            if (isBinding(v) && v.$bind === value.$bind) stillUsed = true
          }
        }),
      )
      if (stillUsed) return
      delete this.eachItemsSchema(scope.propName)[field]
      for (const item of items) delete item[field]
      this.syncEachDefault(scope.propName)
    },

    eachPropOf(node: ContentBlock): string | null {
      const each = node.data?.$each
      return typeof each === 'string' ? each : null
    },
    setEach(id: string, on: boolean) {
      const node = findBlock(this.def.template, id)
      if (!node || id === this.rootId) return
      const current = this.eachPropOf(node)
      if (on) {
        if (current) return
        const props = (this.def.props ??= {}) as Record<string, unknown>
        const propName = uniquePropName('items', props)
        node.data.$each = propName
        this.eachItemsSchema(propName) // creates the array prop shell
        this.eachPreviewItems(propName) // seeds 3 preview items
        this.syncEachDefault(propName)
        return
      }
      if (!current) return
      delete node.data.$each
      // Restore every `$item.*` binding in the (former) scope to the first
      // preview item's value, so the subtree keeps what it showed.
      const preview = (this.def.previewData as Record<string, unknown> | undefined)?.[current]
      const first = Array.isArray(preview) && isObject(preview[0]) ? (preview[0] as Record<string, unknown>) : {}
      walkEachScope(node, (n) =>
        visitDataLayers(n, (obj) => {
          for (const [k, v] of Object.entries(obj)) {
            if (!isBinding(v)) continue
            const field = itemFieldOf(v.$bind)
            if (field === null) continue
            const restored = field === '' ? first : first[field]
            if (restored === undefined) delete obj[k]
            else obj[k] = clone(restored)
          }
        }),
      )
      // Drop the array prop unless another node still repeats over it.
      let stillUsed = false
      walkTree(this.def.template, (n) => {
        if (n.data?.$each === current) stillUsed = true
      })
      if (stillUsed) return
      if (this.def.props) delete (this.def.props as Record<string, unknown>)[current]
      if (this.def.previewData) delete (this.def.previewData as Record<string, unknown>)[current]
    },
    setEachCount(id: string, count: number) {
      const node = findBlock(this.def.template, id)
      const propName = node ? this.eachPropOf(node) : null
      if (!propName) return
      const target = Math.max(1, Math.min(12, Math.round(count)))
      const items = this.eachPreviewItems(propName)
      while (items.length > target) items.pop()
      while (items.length < target) items.push(clone(items[items.length - 1] ?? {}))
      this.syncEachDefault(propName)
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
      walkTree(this.def.template, (node) => {
        replaceBinding(node, from, () => ({ $bind: clean }))
        if (node.data?.$each === from) node.data.$each = clean // repeat props rename too
      })
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
