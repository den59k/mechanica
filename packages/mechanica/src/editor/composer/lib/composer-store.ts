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
  removeBlock,
  moveBlock,
  duplicateBlock,
  placeBlock,
  relocateBlock,
  ensureSlotList,
  type DropPosition,
} from '../../lib/content-tree'
import { humanize } from '../../props-panel/humanize'
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
  /** Canvas view: zoom factor and pan offset (screen px). View state, not persisted. */
  zoom: number
  panX: number
  panY: number
  readonly template: ContentBlock[]
  readonly selected: ContentBlock | null
  /** Preview prop values for the canvas (schema defaults ← previewData). */
  readonly previewProps: Record<string, unknown>
  addElement(blockId: string): void
  /** Insert a pre-built node (a code block, a pasted subtree) at the selection. */
  insertNode(node: ContentBlock): void
  /** Insert a pre-built node at an explicit drop position (drag-to-canvas). */
  insertAt(node: ContentBlock, drop: DropPosition): void
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

/** Create the reactive editor store for one composed block. */
export function createComposerStore(initial: ComposedBlockDefinition): ComposerStore {
  const store = reactive({
    def: clone(initial),
    selectedId: null as string | null,
    breakpoint: 'base' as CanvasBreakpoint,
    zoom: 1,
    panX: 0,
    panY: 0,

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
      if (meta) this.insertNode(meta.create())
    },
    insertNode(node: ContentBlock) {
      const sel = this.selected
      if (sel && isContainerBlock(sel.blockId)) ensureSlotList(sel).push(node)
      else if (sel) placeBlock(this.def.template, node, { anchorId: sel.id, position: 'after' })
      else this.def.template.push(node)
      this.selectedId = node.id
    },
    insertAt(node: ContentBlock, drop: DropPosition) {
      placeBlock(this.def.template, node, drop)
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
      this.def = clone(next)
      if (this.selectedId && !findBlock(this.def.template, this.selectedId)) this.selectedId = null
    },
  })

  return store as unknown as ComposerStore
}
