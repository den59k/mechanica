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

    <!-- ── Style (site design-system classes — one select per group) ── -->
    <section v-if="classGroups.length" class="mech-composer__section">
      <div v-for="g in classGroups" :key="g.key" class="mech-composer__row">
        <span>{{ g.label }}</span>
        <VSelect
          compact
          :model-value="groupValue(g)"
          :options="groupOptions(g)"
          placeholder="None"
          :aria-label="`${g.label} style`"
          @update:model-value="applyGroup(g, $event)"
        >
          <template #option-hint="{ option }">
            <ClassStylePreview :option="option" />
          </template>
        </VSelect>
      </div>
    </section>

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

      <!-- Limits — min/max width & height in a 2×2 grid (dimension rows, Min/Max
           columns). Fields drag-to-scrub. maxWidth on a frame also centers it. -->
      <PropToggle
        v-if="avail('limits')"
        title="Limits"
        icon="limits"
        :active="active('limits')"
        :overridden="limitsOverridden"
        @toggle="toggle('limits')"
        @reset="resetKeys('minWidth', 'maxWidth', 'minHeight', 'maxHeight')"
      >
        <div class="mech-composer__limits">
          <span aria-hidden="true" />
          <span class="mech-composer__limits-col">Min</span>
          <span class="mech-composer__limits-col">Max</span>

          <span class="mech-composer__limits-dim" title="Width"><VIcon name="width" /> W</span>
          <NumInput scrub :model-value="num('minWidth')" placeholder="0" :min="0" :overridden="overridden('minWidth')" aria-label="Min width" @update:model-value="set('minWidth', $event, true)" />
          <NumInput scrub :model-value="num('maxWidth')" placeholder="None" :min="0" :overridden="overridden('maxWidth')" aria-label="Max width" @update:model-value="set('maxWidth', $event, true)" />

          <span class="mech-composer__limits-dim" title="Height"><VIcon name="height" /> H</span>
          <NumInput scrub :model-value="num('minHeight')" placeholder="0" :min="0" :overridden="overridden('minHeight')" aria-label="Min height" @update:model-value="set('minHeight', $event, true)" />
          <NumInput scrub :model-value="num('maxHeight')" placeholder="None" :min="0" :overridden="overridden('maxHeight')" aria-label="Max height" @update:model-value="set('maxHeight', $event, true)" />
        </div>
      </PropToggle>

      <!-- Fill: color + optional background image (focal point, color overlay) -->
      <PropToggle
        v-if="avail('background')"
        title="Fill"
        icon="fill"
        :active="active('background')"
        :overridden="overridden('background') || overridden('bgImage') || overridden('bgOverlay')"
        @toggle="toggle('background')"
        @reset="resetKeys('background', 'bgImage', 'bgOverlay')"
      >
        <ColorField :model-value="val('background')" placeholder="none" @update:model-value="set('background', $event, true)" />
        <div v-if="!bgImg" class="mech-composer__row mech-composer__bgimg-add">
          <span>Image</span>
          <button type="button" class="mech-button" @click="pickBgImage">Add image…</button>
        </div>
        <template v-else>
          <div class="mech-composer__bgimg">
            <div class="mech-composer__image-preview" :style="bgImgPreview" />
            <div class="mech-composer__bgimg-side">
              <button type="button" class="mech-button" @click="pickBgImage">Replace…</button>
              <button type="button" class="mech-button" @click="set('bgImage', undefined, true)">Remove</button>
            </div>
          </div>
          <div class="mech-composer__row mech-composer__row--top">
            <span title="The image point that stays in view as the frame crops it">Focus</span>
            <AnchorGrid :model-value="bgFocalAnchor" @update:model-value="setBgFocal" />
          </div>
          <div class="mech-composer__row mech-composer__row--top">
            <OverrideLabel :overridden="overridden('bgOverlay')" @reset="resetKey('bgOverlay')">Overlay</OverrideLabel>
            <ColorField :model-value="val('bgOverlay')" placeholder="none" @update:model-value="set('bgOverlay', $event, true)" />
          </div>
        </template>
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

      <!-- Link (frame becomes an <a>; text content wraps in one) -->
      <PropToggle v-if="avail('link')" title="Link" icon="link" :active="active('link')" @toggle="toggle('link')">
        <BindField :node-id="node.id" field-key="link" :schema="{ type: 'smartLink' }" name="link">
          <SmartLinkField :model-value="linkValue" :schema="{}" @update:model-value="set('link', $event)" />
        </BindField>
      </PropToggle>

      <!-- Visibility (per breakpoint — "hide on mobile") -->
      <PropToggle
        v-if="avail('visibility')"
        title="Visibility"
        icon="eye"
        :active="active('visibility')"
        :overridden="overridden('hide')"
        @toggle="toggle('visibility')"
        @reset="resetKey('hide')"
      >
        <div class="mech-composer__row">
          <span>{{ store.breakpoint === 'base' ? 'Element' : `On ${store.breakpoint === 'md' ? 'tablet' : 'mobile'}` }}</span>
          <SegControl :options="visibilityOptions" :model-value="val('hide') === true ? 'hide' : 'show'" @update:model-value="setVisibility($event)" />
        </div>
      </PropToggle>

      <!-- Repeat ($each over an array prop) -->
      <PropToggle v-if="avail('repeat')" title="Repeat" icon="repeat" :active="active('repeat')" @toggle="toggle('repeat')">
        <template v-if="eachProp">
          <div class="mech-composer__row">
            <span>Items prop</span>
            <input
              class="mech-composer__input"
              :value="eachProp"
              aria-label="Repeat items prop name"
              @change="renameEach(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="mech-composer__row">
            <span>Preview items</span>
            <NumInput :model-value="eachCount" :min="1" @update:model-value="store.setEachCount(node.id, $event || 1)" />
          </div>
          <p class="mech-composer__hint">
            This element repeats per item. Click ⚡ on a field inside to make it a per-item field.
          </p>
        </template>
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
import { classGroupsFor, selectedClass, setGroupClass, type ClassGroup } from '../lib/class-groups'
import { absAxisLabels, reanchorOffset } from '../lib/abs'
import { ANCHOR_H, ANCHOR_V } from '../../../elements/style-vars'
import type { Block, ComposerClassDef } from 'mechanica-shared'
import VIcon from '../../components/VIcon.vue'
import VSelect, { type SelectOption } from '../../components/VSelect.vue'
import SmartLinkField from '../../fields/editors/SmartLinkField.vue'
import ComponentFields from './ComponentFields.vue'
import ClassStylePreview from './ClassStylePreview.vue'
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
const classDefs = inject<ComposerClassDef[]>('composerClassDefs', [])

const node = computed(() => store.selected!)
const meta = computed(() => elementKind(node.value.blockId))
const kind = computed(() => meta.value)
const isRoot = computed(() => node.value.id === store.rootId)
const headLabel = computed(() => (isRoot.value ? store.def.name || 'Block' : blockLabel(node.value)))
const headIcon = computed(() => blockIcon(node.value))
const codeBlock = computed(() => codeBlocksList.find((block) => block.id === node.value.blockId) ?? null)

// A heading's text reads best as a `title` prop; body text as `text`.
const contentName = computed(() => (val('tag') === 'h1' ? 'title' : 'text'))

// ── Style (site design-system classes, grouped) ───────────────────────
// `cls` is base-only — a class carries its own responsiveness in the site CSS —
// so it's read from base data and written to base even in breakpoint mode. Each
// group is a single-pick select; different groups stack on the element.
const clsValue = computed(() => (typeof node.value.data.cls === 'string' ? (node.value.data.cls as string) : ''))
const kindClassDefs = computed(() => (kind.value ? classDefs.filter((def) => def.kinds.includes(kind.value!)) : []))
const classGroups = computed(() => (kind.value ? classGroupsFor(classDefs, kind.value) : []))
const groupValue = (group: ClassGroup) => selectedClass(clsValue.value, group, kindClassDefs.value)
const groupOptions = (group: ClassGroup): SelectOption[] => {
  const options: SelectOption[] = [{ value: '', label: 'None' }, ...group.defs.map((def) => ({ value: def.cls, label: def.title }))]
  // A stale value (class no longer in the manifest) still shows, marked missing.
  const current = groupValue(group)
  if (current && !group.defs.some((def) => def.cls === current)) options.push({ value: current, label: `${current} (missing)` })
  return options
}
const applyGroup = (group: ClassGroup, value: unknown) => {
  const next = setGroupClass(clsValue.value, group, value ? String(value) : '', kindClassDefs.value)
  store.setData(node.value.id, { cls: next || undefined })
}

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
// A visual row can own several data keys (direction+wrap, align+justify, the
// four Limits) — its reset clears every one of them for the current breakpoint.
const resetKeys = (...keys: string[]) => keys.forEach((key) => store.clearOverride(node.value.id, key))
// Limits owns four keys; its header reset lights when any of them is overridden.
const limitsOverridden = computed(() =>
  ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'].some((key) => store.isOverridden(node.value, key)),
)

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
function pickFile(onPicked: (src: string) => void) {
  if (!uploader) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const { src } = await uploader(file)
    onPicked(src)
  }
  input.click()
}
const pickImage = () => pickFile((src) => set('src', src))

// ── Fill: background image + focal point + overlay ───────────────────
const bgImg = computed(() => {
  const v = val('bgImage')
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
})
const bgImgPreview = computed(() => {
  const src = bgImg.value?.src
  return typeof src === 'string' && src ? { backgroundImage: `url("${src}")` } : {}
})
// Keep the focal point when replacing the image — reframing is usually intact.
const pickBgImage = () => pickFile((src) => set('bgImage', { ...(bgImg.value ?? {}), src }, true))

// The 9-point AnchorGrid doubles as a focal-point picker: anchor ↔ focalX/Y
// thirds (0 / 0.5 / 1), sharing the `$abs` anchor vocabulary.
const FOCAL_H: Record<string, number> = { left: 0, center: 0.5, right: 1 }
const FOCAL_V: Record<string, number> = { top: 0, center: 0.5, bottom: 1 }
const bgFocalAnchor = computed(() => {
  const x = typeof bgImg.value?.focalX === 'number' ? (bgImg.value.focalX as number) : 0.5
  const y = typeof bgImg.value?.focalY === 'number' ? (bgImg.value.focalY as number) : 0.5
  const h = x <= 0.25 ? 'left' : x >= 0.75 ? 'right' : 'center'
  const v = y <= 0.25 ? 'top' : y >= 0.75 ? 'bottom' : 'center'
  if (v === 'center' && h === 'center') return 'center'
  if (v === 'center') return h
  if (h === 'center') return v
  return `${v}-${h}`
})
function setBgFocal(anchor: string) {
  if (!bgImg.value) return
  const focalX = FOCAL_H[ANCHOR_H[anchor] ?? 'center'] ?? 0.5
  const focalY = FOCAL_V[ANCHOR_V[anchor] ?? 'center'] ?? 0.5
  set('bgImage', { ...bgImg.value, focalX, focalY }, true)
}

// ── Link ─────────────────────────────────────────────────────────────
const linkValue = computed(() => {
  const v = node.value.data.link
  return typeof v === 'object' && v !== null && !isBinding(v) ? (v as Record<string, unknown>) : undefined
})

// ── Visibility ───────────────────────────────────────────────────────
const visibilityOptions: SegOption[] = [
  { value: 'show', label: 'Shown' },
  { value: 'hide', label: 'Hidden' },
]
function setVisibility(value: string | number) {
  const hidden = value === 'hide'
  // "Shown" at base is the default — delete the key instead of writing `false`
  // (an explicit `false` only matters as a breakpoint un-hide override).
  if (!hidden && store.breakpoint === 'base') set('hide', undefined)
  else set('hide', hidden, true)
}

// ── Repeat ($each) ───────────────────────────────────────────────────
const eachProp = computed(() => store.eachPropOf(node.value))
const eachCount = computed(() => {
  const prop = eachProp.value
  const items = prop ? (store.def.previewData as Record<string, unknown> | undefined)?.[prop] : null
  return Array.isArray(items) ? items.length : 1
})
const renameEach = (to: string) => {
  if (eachProp.value) store.renameProp(eachProp.value, to)
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
