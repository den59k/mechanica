<template>
  <div class="mech-composer__inspector">
    <div class="mech-composer__inspector-head">
      <VIcon :name="codeBlock?.icon ?? meta?.icon ?? 'slot'" />
      <span>{{ codeBlock?.name ?? meta?.label ?? node.blockId }}</span>
      <button type="button" class="mech-icon-button" title="Close" @click="store.select(null)">
        <VIcon name="close" />
      </button>
    </div>

    <p v-if="store.breakpoint !== 'base'" class="mech-composer__bp-note">
      Editing <strong>{{ store.breakpoint === 'md' ? 'tablet' : 'mobile' }}</strong> overrides
    </p>

    <!-- A composable code block: edit its own props via the standard form. -->
    <section v-if="!meta && codeBlock" class="mech-composer__section mech-composer__codeform">
      <div class="mech-composer__section-title">{{ codeBlock.name }}</div>
      <SchemaForm :model-value="node.data" :schema="codeBlock.props" />
    </section>
    <div v-else-if="!meta" class="mech-composer__section">
      <p class="mech-composer__hint">This block is configured on the page, not here.</p>
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
      <label class="mech-composer__row">
        <span>Tag</span>
        <SegControl :options="tagOptions" :model-value="val('tag')" @update:model-value="set('tag', $event)" />
      </label>
    </section>

    <!-- ── Layout (frame) ─────────────────────────────────────────── -->
    <section v-if="kind === 'frame'" class="mech-composer__section">
      <div class="mech-composer__section-title">Layout</div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('direction')" @reset="resetKey('direction')">Direction</OverrideLabel>
        <SegControl :options="directionOptions" :model-value="val('direction')" @update:model-value="set('direction', $event, true)" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('align')" @reset="resetKey('align')">Align</OverrideLabel>
        <SegControl :options="alignOptions" :model-value="val('align')" @update:model-value="set('align', $event, true)" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('justify')" @reset="resetKey('justify')">Justify</OverrideLabel>
        <SegControl :options="justifyOptions" :model-value="val('justify')" @update:model-value="set('justify', $event, true)" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('gap')" @reset="resetKey('gap')">Gap</OverrideLabel>
        <input type="number" class="mech-composer__num" :value="num('gap')" @input="setNum('gap', $event, true)" />
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('padding')" @reset="resetKey('padding')">Padding</OverrideLabel>
        <div class="mech-composer__pair">
          <input type="number" class="mech-composer__num" title="Vertical" :value="padY" @input="setPadding(numOf($event), padX)" />
          <input type="number" class="mech-composer__num" title="Horizontal" :value="padX" @input="setPadding(padY, numOf($event))" />
        </div>
      </div>
    </section>

    <!-- ── Position (all elements) ────────────────────────────────── -->
    <section v-if="meta" class="mech-composer__section">
      <div class="mech-composer__section-title">Position</div>
      <div class="mech-composer__row">
        <span>Mode</span>
        <SegControl :options="positionOptions" :model-value="isAbsolute ? 'absolute' : 'flow'" @update:model-value="store.setAbsolute(node.id, $event === 'absolute')" />
      </div>
      <template v-if="isAbsolute">
        <div class="mech-composer__row">
          <span>Anchor</span>
          <SegControl :options="anchorOptions" :model-value="absValue('anchor') ?? 'top-left'" @update:model-value="store.setAbs(node.id, { anchor: $event })" />
        </div>
        <div class="mech-composer__row">
          <span>Offset</span>
          <div class="mech-composer__pair">
            <input type="number" class="mech-composer__num" title="X" :value="absNum('x')" @input="store.setAbs(node.id, { x: numOf($event) ?? 0 })" />
            <input type="number" class="mech-composer__num" title="Y" :value="absNum('y')" @input="store.setAbs(node.id, { y: numOf($event) ?? 0 })" />
          </div>
        </div>
      </template>
    </section>

    <!-- ── Size (all) ─────────────────────────────────────────────── -->
    <section class="mech-composer__section">
      <div class="mech-composer__section-title">Size</div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('w')" @reset="resetKey('w')">Width</OverrideLabel>
        <div class="mech-composer__size">
          <SegControl :options="sizeOptions" :model-value="sizeMode('w')" @update:model-value="setSizeMode('w', $event)" />
          <input v-if="sizeMode('w') === 'fixed'" type="number" class="mech-composer__num" :value="sizePx('w')" @input="setSizePx('w', $event)" />
        </div>
      </div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('h')" @reset="resetKey('h')">Height</OverrideLabel>
        <div class="mech-composer__size">
          <SegControl :options="sizeOptions" :model-value="sizeMode('h')" @update:model-value="setSizeMode('h', $event)" />
          <input v-if="sizeMode('h') === 'fixed'" type="number" class="mech-composer__num" :value="sizePx('h')" @input="setSizePx('h', $event)" />
        </div>
      </div>
    </section>

    <!-- ── Typography (text) ──────────────────────────────────────── -->
    <section v-if="kind === 'text'" class="mech-composer__section">
      <div class="mech-composer__section-title">Typography</div>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('size')" @reset="resetKey('size')">Size</OverrideLabel>
        <input type="number" class="mech-composer__num" :value="num('size')" placeholder="16" @input="setNum('size', $event, true)" />
      </div>
      <label class="mech-composer__row">
        <span>Weight</span>
        <SegControl :options="weightOptions" :model-value="val('weight')" @update:model-value="set('weight', $event)" />
      </label>
      <div class="mech-composer__row">
        <OverrideLabel :overridden="overridden('textAlign')" @reset="resetKey('textAlign')">Align</OverrideLabel>
        <SegControl :options="textAlignOptions" :model-value="val('textAlign')" @update:model-value="set('textAlign', $event, true)" />
      </div>
      <div class="mech-composer__row mech-composer__row--top">
        <span>Color</span>
        <ColorField :model-value="val('color')" placeholder="inherit" @update:model-value="set('color', $event)" />
      </div>
    </section>

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
      <label class="mech-composer__row">
        <span>Fit</span>
        <SegControl :options="fitOptions" :model-value="val('fit') ?? 'cover'" @update:model-value="set('fit', $event)" />
      </label>
      <label class="mech-composer__row">
        <span>Radius</span>
        <input type="number" class="mech-composer__num" :value="num('radius')" @input="setNum('radius', $event)" />
      </label>
    </section>

    <!-- ── Button ─────────────────────────────────────────────────── -->
    <section v-if="kind === 'button'" class="mech-composer__section">
      <div class="mech-composer__section-title">Button</div>
      <BindField :node-id="node.id" field-key="label" :schema="{ type: 'string' }" name="label">
        <input class="mech-composer__input" :value="str('label')" placeholder="Label" @input="set('label', target($event).value)" />
      </BindField>
      <BindField :node-id="node.id" field-key="link" :schema="{ type: 'string', format: 'smartLink' }" name="link">
        <input class="mech-composer__input" :value="str('link')" placeholder="Link (e.g. /docs)" @input="set('link', target($event).value || undefined)" />
      </BindField>
      <label class="mech-composer__row">
        <span>Variant</span>
        <SegControl :options="variantOptions" :model-value="val('variant') ?? 'primary'" @update:model-value="set('variant', $event)" />
      </label>
    </section>

    <!-- ── Style (frame) ──────────────────────────────────────────── -->
    <section v-if="kind === 'frame'" class="mech-composer__section">
      <div class="mech-composer__section-title">Style</div>
      <div class="mech-composer__row mech-composer__row--top">
        <span>Background</span>
        <ColorField :model-value="val('background')" placeholder="none" @update:model-value="set('background', $event)" />
      </div>
      <label class="mech-composer__row">
        <span>Radius</span>
        <input type="number" class="mech-composer__num" :value="num('radius')" @input="setNum('radius', $event)" />
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { isBinding, resolveBindings } from 'mechanica-shared'
import { composerStoreKey } from '../lib/keys'
import { elementMeta } from '../lib/elements-meta'
import type { Block } from 'mechanica-shared'
import VIcon from '../../components/VIcon.vue'
import SchemaForm from '../../props-panel/SchemaForm.vue'
import SegControl, { type SegOption } from './SegControl.vue'
import BindField from './BindField.vue'
import OverrideLabel from './OverrideLabel.vue'
import ColorField from './ColorField.vue'

const store = inject(composerStoreKey)!
const uploader = inject<((file: File) => Promise<{ src: string }>) | null>('mechFileUploader', null)
const codeBlocksList = inject<Block[]>('composerCodeBlocks', [])

const node = computed(() => store.selected!)
const meta = computed(() => elementMeta(node.value.blockId))
const kind = computed(() => meta.value?.kind)
const codeBlock = computed(() => codeBlocksList.find((block) => block.id === node.value.blockId) ?? null)

// A heading's text reads best as a `title` prop; body text as `text`.
const contentName = computed(() => (val('tag') === 'h1' ? 'title' : 'text'))

const target = (e: Event) => e.target as HTMLInputElement
const numOf = (e: Event) => {
  const n = Number(target(e).value)
  return target(e).value === '' || Number.isNaN(n) ? undefined : n
}

/** Effective value of a data key at the current breakpoint. */
const val = (key: string) => store.effective(node.value, key)
// A `$bind` value shows its resolved preview value (matching the canvas) rather
// than `[object Object]`; editing then replaces it with a literal. Proper
// binding UI is Stage 2 — until then bound fields still read sensibly.
const str = (key: string) => {
  const v = val(key)
  if (isBinding(v)) return String(resolveBindings(v, store.previewProps) ?? '')
  return v == null ? '' : String(v)
}
const num = (key: string) => (typeof val(key) === 'number' ? (val(key) as number) : '')

const set = (key: string, value: unknown, responsive = false) =>
  store.setData(node.value.id, { [key]: value }, { responsive })
const setNum = (key: string, e: Event, responsive = false) => set(key, numOf(e), responsive)

// Breakpoint override affordances: on a non-base breakpoint, a responsive key
// with its own value here shows a reset back to the inherited value.
const overridden = (key: string) => store.isOverridden(node.value, key)
const resetKey = (key: string) => store.clearOverride(node.value.id, key)

// ── Absolute placement ($abs) ────────────────────────────────────────
const absObj = computed(() => node.value.data.$abs as Record<string, unknown> | undefined)
const isAbsolute = computed(() => !!absObj.value)
const absValue = (key: string) => absObj.value?.[key]
const absNum = (key: string) => (typeof absObj.value?.[key] === 'number' ? (absObj.value![key] as number) : 0)

// ── Padding (vertical / horizontal) ─────────────────────────────────
const padValues = computed<[number, number]>(() => {
  const p = val('padding')
  if (Array.isArray(p)) return [Number(p[0]) || 0, Number(p[1] ?? p[0]) || 0]
  const n = typeof p === 'number' ? p : 0
  return [n, n]
})
const padY = computed(() => padValues.value[0])
const padX = computed(() => padValues.value[1])
const setPadding = (y: number | undefined, x: number | undefined) => {
  const yy = y ?? 0
  const xx = x ?? 0
  set('padding', yy === xx ? yy : [yy, xx], true)
}

// ── Size mode (hug / fill / fixed) ──────────────────────────────────
const sizeMode = (axis: 'w' | 'h') => {
  const v = val(axis)
  return typeof v === 'number' ? 'fixed' : v === 'fill' ? 'fill' : 'hug'
}
const sizePx = (axis: 'w' | 'h') => (typeof val(axis) === 'number' ? (val(axis) as number) : 240)
const setSizeMode = (axis: 'w' | 'h', mode: string | number) => {
  if (mode === 'hug') set(axis, undefined, true)
  else if (mode === 'fill') set(axis, 'fill', true)
  else set(axis, sizePx(axis), true)
}
const setSizePx = (axis: 'w' | 'h', e: Event) => set(axis, numOf(e) ?? 0, true)

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
  { value: 'column', label: 'Vertical' },
  { value: 'row', label: 'Horizontal' },
]
const alignOptions: SegOption[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
]
const justifyOptions: SegOption[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'between', label: 'Between' },
]
const sizeOptions: SegOption[] = [
  { value: 'hug', label: 'Hug' },
  { value: 'fill', label: 'Fill' },
  { value: 'fixed', label: 'Fixed' },
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
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]
const fitOptions: SegOption[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
]
const variantOptions: SegOption[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'ghost', label: 'Ghost' },
]
const positionOptions: SegOption[] = [
  { value: 'flow', label: 'In flow' },
  { value: 'absolute', label: 'Absolute' },
]
const anchorOptions: SegOption[] = [
  { value: 'top-left', label: '↖', title: 'Top left' },
  { value: 'top-right', label: '↗', title: 'Top right' },
  { value: 'center', label: '•', title: 'Center' },
  { value: 'bottom-left', label: '↙', title: 'Bottom left' },
  { value: 'bottom-right', label: '↘', title: 'Bottom right' },
]
</script>
