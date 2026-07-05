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
        <OverrideLabel :overridden="overridden('fit')" @reset="resetKey('fit')">Fit</OverrideLabel>
        <SegControl :options="fitOptions" :model-value="val('fit') ?? 'cover'" @update:model-value="set('fit', $event, true)" />
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
        <OverrideLabel :overridden="overridden('direction') || overridden('wrap')" @reset="resetKeys('direction', 'wrap')">Direction</OverrideLabel>
        <div class="mech-composer__inline">
          <SegControl :options="directionOptions" :model-value="val('direction') ?? 'column'" @update:model-value="set('direction', $event, true)" />
          <button type="button" class="mech-composer__toggle" :class="{ 'is-active': !!val('wrap') }" title="Wrap children" @click="set('wrap', !val('wrap'), true)">
            <VIcon name="wrap" />
          </button>
        </div>
      </div>
      <div class="mech-composer__row mech-composer__row--top">
        <OverrideLabel :overridden="overridden('align') || overridden('justify')" @reset="resetKeys('align', 'justify')">Align</OverrideLabel>
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
          <NumInput
            icon="gap"
            :model-value="num('gap')"
            :min="0"
            @update:model-value="set('gap', $event, true)"
            @pointerenter="gapHover = true"
            @pointerleave="gapHover = false"
            @focusin="gapFocus = true"
            @focusout="gapFocus = false"
            @pointerdown="onGapDown"
          />
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
        <OverrideLabel :overridden="overridden('weight')" @reset="resetKey('weight')">Weight</OverrideLabel>
        <SegControl :options="weightOptions" :model-value="val('weight')" @update:model-value="set('weight', $event, true)" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('textAlign')" @reset="resetKey('textAlign')">Align</OverrideLabel>
        <SegControl :options="textAlignOptions" :model-value="val('textAlign')" @update:model-value="set('textAlign', $event, true)" />
      </div>
      <div class="mech-composer__row mech-composer__row--top">
        <OverrideLabel :overridden="overridden('color')" @reset="resetKey('color')">Color</OverrideLabel>
        <ColorField :model-value="val('color')" placeholder="inherit" @update:model-value="set('color', $event, true)" />
      </div>
    </section>

    <!-- ── Optional properties (each a switch that expands when activated) ── -->
    <section v-if="propDefs.length" class="mech-composer__section mech-composer__props-section">
      <div class="mech-composer__section-title">Properties</div>

      <!-- Padding -->
      <PropToggle
        v-if="avail('padding')"
        title="Padding"
        icon="sides"
        :active="active('padding')"
        :overridden="overridden('padding')"
        @toggle="toggle('padding')"
        @reset="resetKey('padding')"
      >
        <BoxSideInput :model-value="val('padding')" :min="0" label="padding" @update:model-value="set('padding', $event, true)" />
      </PropToggle>

      <!-- Margin (same box editor; negatives allowed) -->
      <PropToggle
        v-if="avail('margin')"
        title="Margin"
        icon="margin"
        :active="active('margin')"
        :overridden="overridden('margin')"
        @toggle="toggle('margin')"
        @reset="resetKey('margin')"
      >
        <BoxSideInput :model-value="val('margin')" label="margin" @update:model-value="set('margin', $event, true)" />
      </PropToggle>

      <!-- Content width -->
      <PropToggle
        v-if="avail('maxWidth')"
        title="Content width"
        icon="width"
        :active="active('maxWidth')"
        :overridden="overridden('maxWidth')"
        @toggle="toggle('maxWidth')"
        @reset="resetKey('maxWidth')"
      >
        <div class="mech-composer__row">
          <span>Max</span>
          <NumInput icon="width" :model-value="num('maxWidth')" placeholder="none" :min="0" @update:model-value="set('maxWidth', $event, true)" />
        </div>
      </PropToggle>

      <!-- Fill -->
      <PropToggle
        v-if="avail('background')"
        title="Fill"
        icon="fill"
        :active="active('background')"
        :overridden="overridden('background')"
        @toggle="toggle('background')"
        @reset="resetKey('background')"
      >
        <ColorField :model-value="val('background')" placeholder="none" @update:model-value="set('background', $event, true)" />
      </PropToggle>

      <!-- Radius -->
      <PropToggle
        v-if="avail('radius')"
        title="Radius"
        icon="corner"
        :active="active('radius')"
        :overridden="overridden('radius')"
        @toggle="toggle('radius')"
        @reset="resetKey('radius')"
      >
        <div class="mech-composer__row">
          <span>Corner</span>
          <NumInput icon="corner" :model-value="num('radius')" :min="0" @update:model-value="set('radius', $event, true)" />
        </div>
      </PropToggle>

      <!-- Position (absolute) -->
      <PropToggle v-if="avail('position')" title="Position" icon="position" :active="active('position')" @toggle="toggle('position')">
        <div
          class="mech-composer__abs"
          @pointerenter="posHover = true"
          @pointerleave="posHover = false"
          @focusin="posFocus = true"
          @focusout="posFocus = false"
          @pointerdown="onPosDown"
        >
          <AnchorGrid :model-value="absAnchor" @update:model-value="setAnchor" />
          <div class="mech-composer__abs-offsets">
            <NumInput :label="axisLabels.x" :model-value="absNum('x')" :aria-label="absXLabel" @update:model-value="store.setAbs(node.id, { x: $event ?? 0 })" />
            <NumInput :label="axisLabels.y" :model-value="absNum('y')" :aria-label="absYLabel" @update:model-value="store.setAbs(node.id, { y: $event ?? 0 })" />
          </div>
        </div>
      </PropToggle>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { isBinding, resolveBindings } from 'mechanica-shared'
import { composerStoreKey } from '../lib/keys'
import { elementKind, blockLabel, blockIcon } from '../lib/elements-meta'
import { availableProps } from '../lib/inspector-props'
import { absAxisLabels, reanchorOffset } from '../lib/abs'
import type { Block } from 'mechanica-shared'
import VIcon from '../../components/VIcon.vue'
import ComponentFields from './ComponentFields.vue'
import SegControl, { type SegOption } from './SegControl.vue'
import BindField from './BindField.vue'
import OverrideLabel from './OverrideLabel.vue'
import ColorField from './ColorField.vue'
import NumInput from './NumInput.vue'
import SizeInput from './SizeInput.vue'
import AlignGrid from './AlignGrid.vue'
import AnchorGrid from './AnchorGrid.vue'
import PropToggle from './PropToggle.vue'
import BoxSideInput from './BoxSideInput.vue'

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
// A visual row can own several data keys (direction+wrap, align+justify) —
// its reset clears every one of them for the current breakpoint.
const resetKeys = (...keys: string[]) => keys.forEach((key) => store.clearOverride(node.value.id, key))

// ── Align extras (stretch / auto space) ──────────────────────────────
const toggleStretch = () => set('align', val('align') === 'stretch' ? 'center' : 'stretch', true)
const toggleAutoSpace = () => set('justify', val('justify') === 'between' ? 'start' : 'between', true)

// ── Gap echo: highlight the frame's gaps on the canvas while the Gap field is
// touched (hover / focus / scrub), mirroring the padding/margin box echo. ─────
const gapHover = ref(false)
const gapFocus = ref(false)
const gapScrub = ref(false)
const gapTouched = computed(() => gapScrub.value || gapFocus.value || gapHover.value)
watch(gapTouched, (on) => {
  if (on) store.spacing = { prop: 'gap' }
  else if (store.spacing?.prop === 'gap') store.spacing = null
})
function onGapDown() {
  gapScrub.value = true // held for the whole scrub, even if the pointer strays
  const up = () => {
    gapScrub.value = false
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointerup', up)
}

// ── Position echo: mark the `$abs` align point on the canvas while the Position
// controls are touched (hover / focus / offset scrub). ────────────────────────
const posHover = ref(false)
const posFocus = ref(false)
const posScrub = ref(false)
const posTouched = computed(() => posScrub.value || posFocus.value || posHover.value)
watch(posTouched, (on) => {
  if (on) store.spacing = { prop: 'position' }
  else if (store.spacing?.prop === 'position') store.spacing = null
})
function onPosDown() {
  posScrub.value = true
  const up = () => {
    posScrub.value = false
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointerup', up)
}

// Clear whichever inspector-owned echo (gap / position) is ours on unmount.
onBeforeUnmount(() => {
  if (store.spacing?.prop === 'gap' || store.spacing?.prop === 'position') store.spacing = null
})

// ── Optional properties (each a switch that expands when activated) ───
// Built-in elements get their kind-specific props; a placed component / composed
// block (no element `meta`) gets only the placement props (margin + position),
// which its wrapping `.mxel` div carries at render time.
const propDefs = computed(() =>
  meta.value ? availableProps(kind.value, isRoot.value) : availableProps(null, false, true),
)
/** Whether this property applies to the selected node at all. */
const avail = (key: string) => propDefs.value.some((p) => p.key === key)
/** On = active (present in data or added this session) → its editor is expanded. */
const active = (key: string) => store.hasProp(node.value, key)
/** Flip a property: activate it (add) or clear it (delete its data everywhere). */
const toggle = (key: string) => {
  if (active(key)) store.removeProp(node.value.id, key)
  else store.addProp(node.value.id, key)
}

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
// Short field labels naming the pinned edge (Left/Right/Top/Bottom).
const axisLabels = computed(() => absAxisLabels(absAnchor.value))

/**
 * Switch the anchor without moving the element: measure its current position
 * relative to its parent (containing block) and re-express it for the new anchor.
 */
function setAnchor(anchor: string) {
  const id = node.value.id
  const el = document.querySelector<HTMLElement>(`.mech-composer__viewport [data-block-id="${id}"]`)
  const parent = el?.offsetParent // the positioned parent frame = the containing block
  if (el && parent instanceof HTMLElement) {
    const er = el.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    const z = store.zoom || 1
    const { x, y } = reanchorOffset(
      { L: (er.left - pr.left) / z, T: (er.top - pr.top) / z, w: er.width / z, h: er.height / z, W: pr.width / z, H: pr.height / z },
      anchor,
    )
    store.setAbs(id, { anchor, x, y })
  } else {
    store.setAbs(id, { anchor })
  }
}

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
