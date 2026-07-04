<template>
  <div class="mech-composer__inspector">
    <div class="mech-composer__inspector-head">
      <VIcon :name="codeBlock?.icon ?? headIcon" />
      <span>{{ codeBlock?.name ?? headLabel }}</span>
      <span v-if="isRoot" class="mech-composer__root-badge">Root</span>
      <button type="button" class="mech-icon-button" title="Close" @click="store.select(null)">
        <VIcon name="close" />
      </button>
    </div>

    <p v-if="store.breakpoint !== 'base'" class="mech-composer__bp-note">
      Editing <strong>{{ store.breakpoint === 'md' ? 'tablet' : 'mobile' }}</strong> overrides
    </p>

    <!-- ── Content (text) ─────────────────────────────────────────── -->
    <section v-if="kind === 'text'" class="mech-composer__section">
      <div class="mech-composer__section-title">Content</div>
      <BindField :node-id="node.id" field-key="content" :schema="{ type: 'string', format: 'text' }" :name="contentName">
        <textarea
          class="mech-composer__input mech-composer__textarea"
          :value="str('content')"
          rows="3"
          @input="set('content', target($event).value)"
        />
      </BindField>
      <div class="mech-composer__row">
        <span>Tag</span>
        <SegControl :options="tagOptions" :model-value="val('tag')" @update:model-value="set('tag', $event)" />
      </div>
    </section>

    <!-- ── Component (site design system) ─────────────────────────── -->
    <section v-if="!meta && codeBlock" class="mech-composer__section mech-composer__codeform">
      <ComponentFields :node="node" :schema="codeBlock.props" />
    </section>
    <div v-else-if="!meta" class="mech-composer__section">
      <p class="mech-composer__hint">This block is configured on the page, not here.</p>
    </div>

    <!-- ── Image ──────────────────────────────────────────────────── -->
    <section v-if="kind === 'image'" class="mech-composer__section">
      <div class="mech-composer__section-title">Image</div>
      <div class="mech-composer__image">
        <div class="mech-composer__image-preview" :style="previewBg" />
        <div class="mech-composer__image-actions">
          <button type="button" class="mech-button" @click="pickImage">Upload…</button>
        </div>
      </div>
      <BindField :node-id="node.id" field-key="src" :schema="{ type: 'string' }" name="image">
        <input class="mech-composer__input" :value="str('src')" placeholder="Image URL" @input="set('src', target($event).value || undefined)" />
      </BindField>
      <BindField :node-id="node.id" field-key="alt" :schema="{ type: 'string' }" name="alt">
        <input class="mech-composer__input" :value="str('alt')" placeholder="Alt text" @input="set('alt', target($event).value || undefined)" />
      </BindField>
      <div class="mech-composer__row">
        <span>Fit</span>
        <SegControl :options="fitOptions" :model-value="val('fit') ?? 'cover'" @update:model-value="set('fit', $event)" />
      </div>
    </section>

    <!-- ── Size (all elements) ────────────────────────────────────── -->
    <section v-if="meta" class="mech-composer__section">
      <div class="mech-composer__section-title">Size</div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('w')" @reset="resetKey('w')">Width</OverrideLabel>
        <SizeInput :node="node" axis="w" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('h')" @reset="resetKey('h')">Height</OverrideLabel>
        <SizeInput :node="node" axis="h" />
      </div>
    </section>

    <!-- ── Layout (frame) ─────────────────────────────────────────── -->
    <section v-if="kind === 'frame'" class="mech-composer__section">
      <div class="mech-composer__section-title">Layout</div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('direction')" @reset="resetKey('direction')">Direction</OverrideLabel>
        <div class="mech-composer__inline">
          <SegControl :options="directionOptions" :model-value="val('direction') ?? 'column'" @update:model-value="set('direction', $event, true)" />
          <button type="button" class="mech-composer__toggle" :class="{ 'is-active': !!val('wrap') }" title="Wrap children" @click="set('wrap', !val('wrap'), true)">
            <VIcon name="wrap" />
          </button>
        </div>
      </div>
      <div class="mech-composer__row mech-composer__row--top">
        <span>Align</span>
        <div class="mech-composer__align-block">
          <AlignGrid :node="node" />
          <button type="button" class="mech-composer__toggle" :class="{ 'is-active': val('align') === 'stretch' }" title="Stretch children across" @click="toggleStretch">
            Stretch
          </button>
        </div>
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('gap')" @reset="resetKey('gap')">Gap</OverrideLabel>
        <div class="mech-composer__inline">
          <NumInput icon="gap" :model-value="num('gap')" :min="0" @update:model-value="set('gap', $event, true)" />
          <button type="button" class="mech-composer__toggle" :class="{ 'is-active': val('justify') === 'between' }" title="Auto space (space-between)" @click="toggleAutoSpace">
            Auto
          </button>
        </div>
      </div>
      <button
        v-if="store.canUngroup"
        type="button"
        class="mech-button mech-composer__ungroup-btn"
        title="Ungroup — lift children into the parent (Ctrl+Shift+G)"
        @click="store.ungroup()"
      >
        <VIcon name="frame" /> Ungroup
      </button>
    </section>

    <!-- ── Typography (text) ──────────────────────────────────────── -->
    <section v-if="kind === 'text'" class="mech-composer__section">
      <div class="mech-composer__section-title">Typography</div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('size')" @reset="resetKey('size')">Size</OverrideLabel>
        <NumInput :model-value="num('size')" placeholder="16" :min="1" @update:model-value="set('size', $event, true)" />
      </div>
      <div class="mech-composer__row">
        <span>Weight</span>
        <SegControl :options="weightOptions" :model-value="val('weight')" @update:model-value="set('weight', $event)" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('textAlign')" @reset="resetKey('textAlign')">Align</OverrideLabel>
        <SegControl :options="textAlignOptions" :model-value="val('textAlign')" @update:model-value="set('textAlign', $event, true)" />
      </div>
      <div class="mech-composer__row mech-composer__row--top">
        <span>Color</span>
        <ColorField :model-value="val('color')" placeholder="inherit" @update:model-value="set('color', $event)" />
      </div>
    </section>

    <!-- ── Optional properties (added on demand via "+") ──────────── -->
    <section v-if="propDefs.length" class="mech-composer__section mech-composer__props-section">
      <div class="mech-composer__props-head">
        <span>Properties</span>
        <button
          ref="addBtn"
          type="button"
          class="mech-icon-button"
          title="Add property"
          :disabled="!addable.length"
          @click="addOpen = !addOpen"
        >
          <VIcon name="plus" />
        </button>
      </div>

      <!-- Padding -->
      <div v-if="show('padding')" class="mech-composer__row mech-composer__prop" :class="{ 'mech-composer__row--top': padExpanded }">
        <OverrideLabel :overridden="overridden('padding')" @reset="resetKey('padding')">Padding</OverrideLabel>
        <div class="mech-composer__pad">
          <div class="mech-composer__pad-fields">
            <template v-if="!padExpanded">
              <NumInput icon="row" aria-label="Vertical padding" :model-value="pad.t" :min="0" @update:model-value="setPadV" />
              <NumInput icon="column" aria-label="Horizontal padding" :model-value="pad.r" :min="0" @update:model-value="setPadH" />
            </template>
            <template v-else>
              <NumInput label="T" :model-value="pad.t" :min="0" @update:model-value="setPad('t', $event)" />
              <NumInput label="R" :model-value="pad.r" :min="0" @update:model-value="setPad('r', $event)" />
              <NumInput label="B" :model-value="pad.b" :min="0" @update:model-value="setPad('b', $event)" />
              <NumInput label="L" :model-value="pad.l" :min="0" @update:model-value="setPad('l', $event)" />
            </template>
          </div>
          <button type="button" class="mech-composer__toggle" :class="{ 'is-active': padExpanded }" title="Edit each side" @click="padExpanded = !padExpanded">
            <VIcon name="sides" />
          </button>
        </div>
        <button type="button" class="mech-composer__prop-remove" title="Remove padding" @click="removeProp('padding')">
          <VIcon name="close" />
        </button>
      </div>

      <!-- Margin -->
      <div v-if="show('margin')" class="mech-composer__row mech-composer__prop" :class="{ 'mech-composer__row--top': marExpanded }">
        <OverrideLabel :overridden="overridden('margin')" @reset="resetKey('margin')">Margin</OverrideLabel>
        <div class="mech-composer__pad">
          <div class="mech-composer__pad-fields">
            <template v-if="!marExpanded">
              <NumInput icon="row" aria-label="Vertical margin" :model-value="mar.t" @update:model-value="setMarV" />
              <NumInput icon="column" aria-label="Horizontal margin" :model-value="mar.r" @update:model-value="setMarH" />
            </template>
            <template v-else>
              <NumInput label="T" :model-value="mar.t" @update:model-value="setMar('t', $event)" />
              <NumInput label="R" :model-value="mar.r" @update:model-value="setMar('r', $event)" />
              <NumInput label="B" :model-value="mar.b" @update:model-value="setMar('b', $event)" />
              <NumInput label="L" :model-value="mar.l" @update:model-value="setMar('l', $event)" />
            </template>
          </div>
          <button type="button" class="mech-composer__toggle" :class="{ 'is-active': marExpanded }" title="Edit each side" @click="marExpanded = !marExpanded">
            <VIcon name="sides" />
          </button>
        </div>
        <button type="button" class="mech-composer__prop-remove" title="Remove margin" @click="removeProp('margin')">
          <VIcon name="close" />
        </button>
      </div>

      <!-- Content width -->
      <div v-if="show('maxWidth')" class="mech-composer__row mech-composer__prop">
        <OverrideLabel :overridden="overridden('maxWidth')" @reset="resetKey('maxWidth')">Content w</OverrideLabel>
        <NumInput icon="width" :model-value="num('maxWidth')" placeholder="none" :min="0" @update:model-value="set('maxWidth', $event, true)" />
        <button type="button" class="mech-composer__prop-remove" title="Remove content width" @click="removeProp('maxWidth')">
          <VIcon name="close" />
        </button>
      </div>

      <!-- Fill -->
      <div v-if="show('background')" class="mech-composer__row mech-composer__row--top mech-composer__prop">
        <span>Fill</span>
        <ColorField :model-value="val('background')" placeholder="none" @update:model-value="set('background', $event)" />
        <button type="button" class="mech-composer__prop-remove" title="Remove fill" @click="removeProp('background')">
          <VIcon name="close" />
        </button>
      </div>

      <!-- Radius -->
      <div v-if="show('radius')" class="mech-composer__row mech-composer__prop">
        <span>Radius</span>
        <NumInput icon="corner" :model-value="num('radius')" :min="0" @update:model-value="set('radius', $event)" />
        <button type="button" class="mech-composer__prop-remove" title="Remove radius" @click="removeProp('radius')">
          <VIcon name="close" />
        </button>
      </div>

      <!-- Position (absolute) -->
      <div v-if="show('position')" class="mech-composer__row mech-composer__row--top mech-composer__prop">
        <span>Position</span>
        <div class="mech-composer__abs">
          <AnchorGrid :model-value="absAnchor" @update:model-value="store.setAbs(node.id, { anchor: $event })" />
          <div class="mech-composer__abs-offsets">
            <NumInput label="X" :model-value="absNum('x')" :aria-label="absXLabel" @update:model-value="store.setAbs(node.id, { x: $event ?? 0 })" />
            <NumInput label="Y" :model-value="absNum('y')" :aria-label="absYLabel" @update:model-value="store.setAbs(node.id, { y: $event ?? 0 })" />
          </div>
        </div>
        <button type="button" class="mech-composer__prop-remove" title="Back to flow" @click="removeProp('position')">
          <VIcon name="close" />
        </button>
      </div>

      <VPopover v-model:open="addOpen" :anchor="addBtn" panel-class="mech-composer__add-menu">
        <button v-for="p in addable" :key="p.key" type="button" class="mech-composer__add-item" @click="onAdd(p.key)">
          <VIcon :name="p.icon" />
          <span>{{ p.title }}</span>
        </button>
      </VPopover>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { isBinding, resolveBindings } from 'mechanica-shared'
import { composerStoreKey } from '../lib/keys'
import { elementKind, blockLabel, blockIcon } from '../lib/elements-meta'
import { availableProps } from '../lib/inspector-props'
import { parsePadding, collapsePadding, setSide, type Sides } from '../lib/padding'
import type { Block } from 'mechanica-shared'
import VIcon from '../../components/VIcon.vue'
import VPopover from '../../components/VPopover.vue'
import ComponentFields from './ComponentFields.vue'
import SegControl, { type SegOption } from './SegControl.vue'
import BindField from './BindField.vue'
import OverrideLabel from './OverrideLabel.vue'
import ColorField from './ColorField.vue'
import NumInput from './NumInput.vue'
import SizeInput from './SizeInput.vue'
import AlignGrid from './AlignGrid.vue'
import AnchorGrid from './AnchorGrid.vue'

const store = inject(composerStoreKey)!
const uploader = inject<((file: File) => Promise<{ src: string }>) | null>('mechFileUploader', null)
const codeBlocksList = inject<Block[]>('composerCodeBlocks', [])

const node = computed(() => store.selected!)
const meta = computed(() => elementKind(node.value.blockId))
const kind = computed(() => meta.value)
const isRoot = computed(() => node.value.id === store.rootId)
const headLabel = computed(() => (isRoot.value ? store.def.name || 'Block' : blockLabel(node.value)))
const headIcon = computed(() => blockIcon(node.value))
const codeBlock = computed(() => codeBlocksList.find((block) => block.id === node.value.blockId) ?? null)

// A heading's text reads best as a `title` prop; body text as `text`.
const contentName = computed(() => (val('tag') === 'h1' ? 'title' : 'text'))

const target = (e: Event) => e.target as HTMLInputElement

/** Effective value of a data key at the current breakpoint. */
const val = (key: string) => store.effective(node.value, key)
const str = (key: string) => {
  const v = val(key)
  if (isBinding(v)) return String(resolveBindings(v, store.previewProps) ?? '')
  return v == null ? '' : String(v)
}
const num = (key: string): number | '' => (typeof val(key) === 'number' ? (val(key) as number) : '')

const set = (key: string, value: unknown, responsive = false) =>
  store.setData(node.value.id, { [key]: value }, { responsive })

// Breakpoint override affordances.
const overridden = (key: string) => store.isOverridden(node.value, key)
const resetKey = (key: string) => store.clearOverride(node.value.id, key)

// ── Align extras (stretch / auto space) ──────────────────────────────
const toggleStretch = () => set('align', val('align') === 'stretch' ? 'center' : 'stretch', true)
const toggleAutoSpace = () => set('justify', val('justify') === 'between' ? 'start' : 'between', true)

// ── Optional properties (the "+ Add" menu) ───────────────────────────
const addOpen = ref(false)
const addBtn = ref<HTMLElement | null>(null)
// Built-in elements get their kind-specific props; a placed component / composed
// block (no element `meta`) gets only the placement props (margin + position),
// which its wrapping `.mxel` div carries at render time.
const propDefs = computed(() =>
  meta.value ? availableProps(kind.value, isRoot.value) : availableProps(null, false, true),
)
/** A row renders when the property applies to this kind AND is present/added. */
const show = (key: string) => propDefs.value.some((p) => p.key === key) && store.hasProp(node.value, key)
const addable = computed(() => propDefs.value.filter((p) => !store.hasProp(node.value, p.key)))
const onAdd = (key: string) => {
  store.addProp(node.value.id, key)
  addOpen.value = false
}
const removeProp = (key: string) => store.removeProp(node.value.id, key)

// ── Padding (per-side) ───────────────────────────────────────────────
const padExpanded = ref(false)
const pad = computed<Sides>(() => parsePadding(val('padding')))
const setPad = (side: keyof Sides, n: number | undefined) => set('padding', setSide(val('padding'), side, n ?? 0), true)
const setPadV = (n: number | undefined) => set('padding', collapsePadding({ ...pad.value, t: n ?? 0, b: n ?? 0 }), true)
const setPadH = (n: number | undefined) => set('padding', collapsePadding({ ...pad.value, r: n ?? 0, l: n ?? 0 }), true)

// ── Margin (same sides math, negatives allowed) ──────────────────────
const marExpanded = ref(false)
const mar = computed<Sides>(() => parsePadding(val('margin')))
const setMar = (side: keyof Sides, n: number | undefined) => set('margin', setSide(val('margin'), side, n ?? 0), true)
const setMarV = (n: number | undefined) => set('margin', collapsePadding({ ...mar.value, t: n ?? 0, b: n ?? 0 }), true)
const setMarH = (n: number | undefined) => set('margin', collapsePadding({ ...mar.value, r: n ?? 0, l: n ?? 0 }), true)

// ── Absolute placement ($abs) ────────────────────────────────────────
const absObj = computed(() => node.value.data.$abs as Record<string, unknown> | undefined)
const absValue = (key: string) => absObj.value?.[key]
const absNum = (key: string): number | '' =>
  typeof absObj.value?.[key] === 'number' ? (absObj.value![key] as number) : 0
const absAnchor = computed(() => (typeof absValue('anchor') === 'string' ? (absValue('anchor') as string) : 'top-left'))
// The offset origin depends on the pinned edge, so spell it out for a11y.
const absXLabel = computed(() => {
  const a = absAnchor.value
  if (a === 'top-right' || a === 'bottom-right' || a === 'right') return 'Offset from right edge'
  if (a === 'top' || a === 'bottom' || a === 'center') return 'Horizontal offset from center'
  return 'Offset from left edge'
})
const absYLabel = computed(() => {
  const a = absAnchor.value
  if (a === 'bottom-left' || a === 'bottom-right' || a === 'bottom') return 'Offset from bottom edge'
  if (a === 'left' || a === 'right' || a === 'center') return 'Vertical offset from center'
  return 'Offset from top edge'
})

// ── Image ────────────────────────────────────────────────────────────
const previewBg = computed(() => {
  const src = val('src')
  return typeof src === 'string' && src ? { backgroundImage: `url("${src}")` } : {}
})
async function pickImage() {
  if (!uploader) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const { src } = await uploader(file)
    set('src', src)
  }
  input.click()
}

// ── Option sets ──────────────────────────────────────────────────────
const directionOptions: SegOption[] = [
  { value: 'column', icon: 'column', title: 'Vertical (column)' },
  { value: 'row', icon: 'row', title: 'Horizontal (row)' },
]
const tagOptions: SegOption[] = [
  { value: 'h1', label: 'H1' },
  { value: 'h2', label: 'H2' },
  { value: 'h3', label: 'H3' },
  { value: 'p', label: 'P' },
]
const weightOptions: SegOption[] = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi' },
  { value: 700, label: 'Bold' },
]
const textAlignOptions: SegOption[] = [
  { value: 'left', icon: 'align-left', title: 'Align left' },
  { value: 'center', icon: 'align-center', title: 'Align center' },
  { value: 'right', icon: 'align-right', title: 'Align right' },
]
const fitOptions: SegOption[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
]
</script>
