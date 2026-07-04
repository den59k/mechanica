<template>
  <div class="mech-composer__inspector">
    <div class="mech-composer__inspector-head">
      <VIcon :name="meta?.icon ?? 'slot'" />
      <span>{{ meta?.label ?? node.blockId }}</span>
      <button type="button" class="mech-icon-button" title="Close" @click="store.select(null)">
        <VIcon name="close" />
      </button>
    </div>

    <p v-if="store.breakpoint !== 'base'" class="mech-composer__bp-note">
      Editing <strong>{{ store.breakpoint === 'md' ? 'tablet' : 'mobile' }}</strong> overrides
    </p>

    <div v-if="!meta" class="mech-composer__section">
      <p class="mech-composer__hint">This block is configured on the page, not here.</p>
    </div>

    <!-- ── Content (text) ─────────────────────────────────────────── -->
    <section v-if="kind === 'text'" class="mech-composer__section">
      <div class="mech-composer__section-title">Content</div>
      <textarea
        class="mech-composer__input mech-composer__textarea"
        :value="str('content')"
        rows="3"
        @input="set('content', target($event).value)"
      />
      <label class="mech-composer__row">
        <span>Tag</span>
        <SegControl :options="tagOptions" :model-value="val('tag')" @update:model-value="set('tag', $event)" />
      </label>
    </section>

    <!-- ── Layout (frame) ─────────────────────────────────────────── -->
    <section v-if="kind === 'frame'" class="mech-composer__section">
      <div class="mech-composer__section-title">Layout</div>
      <label class="mech-composer__row">
        <span>Direction</span>
        <SegControl :options="directionOptions" :model-value="val('direction')" @update:model-value="set('direction', $event, true)" />
      </label>
      <label class="mech-composer__row">
        <span>Align</span>
        <SegControl :options="alignOptions" :model-value="val('align')" @update:model-value="set('align', $event, true)" />
      </label>
      <label class="mech-composer__row">
        <span>Justify</span>
        <SegControl :options="justifyOptions" :model-value="val('justify')" @update:model-value="set('justify', $event, true)" />
      </label>
      <label class="mech-composer__row">
        <span>Gap</span>
        <input type="number" class="mech-composer__num" :value="num('gap')" @input="setNum('gap', $event, true)" />
      </label>
      <div class="mech-composer__row">
        <span>Padding</span>
        <div class="mech-composer__pair">
          <input type="number" class="mech-composer__num" title="Vertical" :value="padY" @input="setPadding(numOf($event), padX)" />
          <input type="number" class="mech-composer__num" title="Horizontal" :value="padX" @input="setPadding(padY, numOf($event))" />
        </div>
      </div>
    </section>

    <!-- ── Size (all) ─────────────────────────────────────────────── -->
    <section class="mech-composer__section">
      <div class="mech-composer__section-title">Size</div>
      <div class="mech-composer__row">
        <span>Width</span>
        <div class="mech-composer__size">
          <SegControl :options="sizeOptions" :model-value="sizeMode('w')" @update:model-value="setSizeMode('w', $event)" />
          <input v-if="sizeMode('w') === 'fixed'" type="number" class="mech-composer__num" :value="sizePx('w')" @input="setSizePx('w', $event)" />
        </div>
      </div>
      <div class="mech-composer__row">
        <span>Height</span>
        <div class="mech-composer__size">
          <SegControl :options="sizeOptions" :model-value="sizeMode('h')" @update:model-value="setSizeMode('h', $event)" />
          <input v-if="sizeMode('h') === 'fixed'" type="number" class="mech-composer__num" :value="sizePx('h')" @input="setSizePx('h', $event)" />
        </div>
      </div>
    </section>

    <!-- ── Typography (text) ──────────────────────────────────────── -->
    <section v-if="kind === 'text'" class="mech-composer__section">
      <div class="mech-composer__section-title">Typography</div>
      <label class="mech-composer__row">
        <span>Size</span>
        <input type="number" class="mech-composer__num" :value="num('size')" placeholder="16" @input="setNum('size', $event, true)" />
      </label>
      <label class="mech-composer__row">
        <span>Weight</span>
        <SegControl :options="weightOptions" :model-value="val('weight')" @update:model-value="set('weight', $event)" />
      </label>
      <label class="mech-composer__row">
        <span>Align</span>
        <SegControl :options="textAlignOptions" :model-value="val('textAlign')" @update:model-value="set('textAlign', $event, true)" />
      </label>
      <label class="mech-composer__row">
        <span>Color</span>
        <span class="mech-composer__color">
          <input type="color" :value="asColor(val('color'))" @input="set('color', target($event).value)" />
          <input type="text" class="mech-composer__input" :value="str('color')" placeholder="inherit" @input="set('color', target($event).value || undefined)" />
        </span>
      </label>
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
      <input class="mech-composer__input" :value="str('src')" placeholder="Image URL" @input="set('src', target($event).value || undefined)" />
      <input class="mech-composer__input" :value="str('alt')" placeholder="Alt text" @input="set('alt', target($event).value || undefined)" />
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
      <input class="mech-composer__input" :value="str('label')" placeholder="Label" @input="set('label', target($event).value)" />
      <input class="mech-composer__input" :value="str('link')" placeholder="Link (e.g. /docs)" @input="set('link', target($event).value || undefined)" />
      <label class="mech-composer__row">
        <span>Variant</span>
        <SegControl :options="variantOptions" :model-value="val('variant') ?? 'primary'" @update:model-value="set('variant', $event)" />
      </label>
    </section>

    <!-- ── Style (frame) ──────────────────────────────────────────── -->
    <section v-if="kind === 'frame'" class="mech-composer__section">
      <div class="mech-composer__section-title">Style</div>
      <label class="mech-composer__row">
        <span>Background</span>
        <span class="mech-composer__color">
          <input type="color" :value="asColor(val('background'))" @input="set('background', target($event).value)" />
          <input type="text" class="mech-composer__input" :value="str('background')" placeholder="none" @input="set('background', target($event).value || undefined)" />
        </span>
      </label>
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
import VIcon from '../../components/VIcon.vue'
import SegControl, { type SegOption } from './SegControl.vue'

const store = inject(composerStoreKey)!
const uploader = inject<((file: File) => Promise<{ src: string }>) | null>('mechFileUploader', null)

const node = computed(() => store.selected!)
const meta = computed(() => elementMeta(node.value.blockId))
const kind = computed(() => meta.value?.kind)

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

// ── Colors / image ──────────────────────────────────────────────────
const asColor = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#ffffff')
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
</script>
