<template>
  <div class="mech-rte" :class="toolbar ? 'mech-rte--full' : 'mech-rte--minimal'">
    <!-- View toggle, above the box so it sits outside the field's focus ring. -->
    <div class="mech-rte__switchbar">
      <div class="mech-rte__switch">
        <button type="button" :class="{ 'is-active': mode === 'rich' }" @click="mode = 'rich'">Rich</button>
        <button type="button" :class="{ 'is-active': mode === 'markdown' }" @click="setMarkdownMode">Markdown</button>
      </div>
    </div>

    <div class="mech-rte__box">
      <!-- Formatting toolbar lives inside the box, only in the full rich view. -->
      <div v-if="toolbar && mode === 'rich'" class="mech-rte__bar">
        <VSelect
          v-if="blockType !== 'callout'"
          compact
          class="mech-rte__type"
          :model-value="blockType"
          :options="blockTypes"
          placeholder="Mixed"
          title="Block type"
          @update:model-value="setBlockType($event as string)"
        />
        <VSelect
          v-else
          compact
          class="mech-rte__type"
          :model-value="calloutTone"
          :options="calloutTones"
          title="Callout tone"
          @update:model-value="setCalloutTone($event as string)"
        />

        <span class="mech-rte__divider" />

        <button
          v-for="b in styleButtons"
          :key="b.style"
          type="button"
          class="mech-icon-button"
          :class="{ 'is-active': b.active }"
          :title="b.title"
          @mousedown.prevent
          @click="toggleStyle(b.style)"
        >
          <VIcon :name="b.icon" />
        </button>

        <span class="mech-rte__divider" />

        <button
          ref="insertBtn"
          type="button"
          class="mech-icon-button"
          title="Insert"
          @mousedown.prevent
          @click="insertOpen = !insertOpen"
        >
          <VIcon name="plus" />
        </button>
        <VPopover
          :open="insertOpen"
          :anchor="insertBtn"
          panel-class="mech-rte__insert"
          @update:open="insertOpen = $event"
        >
          <button
            v-for="w in widgets"
            :key="w.type"
            type="button"
            class="mech-rte__insert-item"
            @mousedown.prevent
            @click="insertWidget(w)"
          >
            <!-- Site widgets may carry a raw <svg> string instead of a VIcon name. -->
            <span v-if="isRawSvg(w.icon)" class="mech-rte__insert-icon" v-html="w.icon" />
            <VIcon v-else :name="w.icon" class="mech-rte__insert-icon" />
            <span>{{ w.title }}</span>
          </button>
        </VPopover>
      </div>

      <TextEditor
        v-if="mode === 'rich'"
        ref="editorRef"
        v-model="model"
        class="mech-rte__surface"
        :renderer="renderer"
        :decorator="decorator"
        :html-parser="htmlParser"
        @keydown="onKeyDown"
      >
        <!-- Every widget with an editing component (built-in or site-defined)
             renders through its own per-type slot, behind an error boundary. -->
        <template v-for="w in editorWidgets" :key="w.type" #[w.type]="{ block }">
          <WidgetBoundary :label="w.title">
            <component :is="w.editor" :block="block" @change="onWidgetChange" />
          </WidgetBoundary>
        </template>
        <template #placeholder>
          <div class="mech-rte__placeholder" :contenteditable="false">{{ placeholder }}</div>
        </template>
      </TextEditor>

      <textarea
        v-else
        ref="markdownRef"
        class="mech-rte__surface mech-rte__markdown"
        :value="markdown"
        spellcheck="false"
        :placeholder="placeholder"
        @input="onMarkdownInput"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { TextEditor, uid } from 'vuewrite'
import type { Block, TextEditorRef } from 'vuewrite'
import { blocksToMarkdown, markdownToBlocks } from 'vuewrite/markdown'
import VIcon from '../../components/VIcon.vue'
import VSelect from '../../components/VSelect.vue'
import VPopover from '../../components/VPopover.vue'
import WidgetBoundary from './WidgetBoundary.vue'
import { allRichTextWidgets, type RichTextWidget } from './widgets'
import { renderer, decorator, htmlParser, blockTypes } from './config'

const props = withDefaults(
  defineProps<{
    modelValue?: Block[]
    placeholder?: string
    /** Show the formatting toolbar + Markdown switch. Off = minimal inline field. */
    toolbar?: boolean
  }>(),
  { placeholder: 'Write…', toolbar: true },
)
const emit = defineEmits<{ 'update:modelValue': [Block[]] }>()

const editorRef = shallowRef<TextEditorRef>()
const mode = ref<'rich' | 'markdown'>('rich')

/** Always edit a non-empty document so vuewrite has a focusable block. */
const blank = (): Block[] => [{ id: uid(), text: '' }]
const model = ref<Block[]>(props.modelValue?.length ? props.modelValue : blank())

// vuewrite mutates the document reactively; mirror every change up to the field.
watch(model, (value) => emit('update:modelValue', value), { deep: true })

// ── Block type ──────────────────────────────────────────────────────────────────

const blockType = computed(() => {
  const editor = editorRef.value
  if (!editor) return 'default'
  let type = ''
  for (const block of editor.getCurrentBlocks()) {
    const current = block.type ?? 'default'
    if (!type) type = current
    else if (type !== current) return 'mixed'
  }
  return type || 'default'
})

function setBlockType(id: string): void {
  const editor = editorRef.value
  if (!editor || id === 'mixed') return
  for (const block of editor.getCurrentBlocks()) block.type = id === 'default' ? undefined : id
  editor.pushHistory('changeBlockType')
}

// ── Callout tone (contextual: shown when the caret is in a callout) ─────────────

const calloutTones = [
  { value: 'info', label: 'Info' },
  { value: 'tip', label: 'Tip' },
  { value: 'warning', label: 'Warning' },
]

const calloutTone = computed(() => {
  for (const block of editorRef.value?.getCurrentBlocks() ?? []) {
    if (block.type === 'callout') return (block.tone as string) ?? 'info'
  }
  return 'info'
})

function setCalloutTone(tone: string): void {
  const editor = editorRef.value
  if (!editor) return
  for (const block of editor.getCurrentBlocks()) {
    if (block.type === 'callout') (block as Record<string, unknown>).tone = tone
  }
  editor.pushHistory('changeBlockType')
}

// ── Inline styles ───────────────────────────────────────────────────────────────

const styleButtons = computed(() => {
  const styles = editorRef.value?.currentStyles
  return [
    { style: 'bold', icon: 'bold', title: 'Bold (Ctrl+B)', active: styles?.has('bold') ?? false },
    { style: 'italic', icon: 'italic', title: 'Italic (Ctrl+I)', active: styles?.has('italic') ?? false },
    { style: 'underline', icon: 'underline', title: 'Underline (Ctrl+U)', active: styles?.has('underline') ?? false },
    { style: 'strikethrough', icon: 'strikethrough', title: 'Strikethrough', active: styles?.has('strikethrough') ?? false },
    { style: 'code', icon: 'code', title: 'Inline code', active: styles?.has('code') ?? false },
  ]
})

function toggleStyle(style: string): void {
  const editor = editorRef.value
  if (!editor) return
  if (!editor.isFocused) editor.selectAll()
  editor.toggleStyle(style)
}

// ── Widgets (image, …) ────────────────────────────────────────────────────────

const insertBtn = ref<HTMLElement | null>(null)
const insertOpen = ref(false)

// Registration happens once in the editor entry, before anything mounts — a
// plain snapshot at setup is enough.
const widgets = allRichTextWidgets()
const editorWidgets = widgets.filter((w) => w.editor)

const isRawSvg = (icon: string): boolean => icon.trimStart().startsWith('<svg')

/**
 * Make sure there's a caret to insert at. `@mousedown.prevent` keeps the editor
 * focused while the toolbar/menu is used, but if it was never focused vuewrite
 * has no `currentBlock` and `insertBlock` would no-op — so aim at the end.
 */
function ensureCaret(): boolean {
  const editor = editorRef.value
  if (!editor) return false
  if (editor.currentBlock) return true
  const last = model.value[model.value.length - 1]
  if (!last) return false
  editor.selection.anchor.blockId = last.id
  editor.selection.anchor.offset = last.text.length
  editor.selection.focus.blockId = last.id
  editor.selection.focus.offset = last.text.length
  return !!editor.currentBlock
}

function insertWidget(widget: RichTextWidget): void {
  insertOpen.value = false
  const editor = editorRef.value
  if (!editor || !ensureCaret()) return
  editor.insertBlock(widget.create())
}

/** A widget mutated its own block (e.g. an image upload) — record it for undo. */
function onWidgetChange(): void {
  editorRef.value?.pushHistory('setText')
}

// ── WYSIWYG ⇄ Markdown switch ─────────────────────────────────────────────────────

const markdown = ref('')
const markdownRef = ref<HTMLTextAreaElement>()
let fromMarkdown = false

// A <textarea> doesn't grow with its content the way the contenteditable surface
// does, so size it to fit (capped by max-height in CSS) — keeping the two views a
// consistent height instead of a tall Rich view next to a short Markdown box.
function autosizeMarkdown(): void {
  const el = markdownRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function setMarkdownMode(): void {
  markdown.value = blocksToMarkdown(model.value, { softBreaks: true })
  mode.value = 'markdown'
  nextTick(autosizeMarkdown)
}

watch(
  model,
  (blocks) => {
    if (!fromMarkdown && mode.value === 'markdown') {
      markdown.value = blocksToMarkdown(blocks, { softBreaks: true })
      nextTick(autosizeMarkdown)
    }
  },
  { deep: true },
)

function onMarkdownInput(event: Event): void {
  const md = (event.target as HTMLTextAreaElement).value
  markdown.value = md
  fromMarkdown = true
  model.value = markdownToBlocks(md, model.value, { softBreaks: true })
  autosizeMarkdown()
  nextTick(() => (fromMarkdown = false))
}

// ── Keyboard: format shortcuts + Markdown prefixes + list continuation ────────────

function onKeyDown(event: KeyboardEvent): void {
  const editor = editorRef.value
  if (!editor) return

  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    const style = ({ KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' } as Record<string, string>)[event.code]
    if (style) {
      editor.toggleStyle(style)
      event.preventDefault()
      return
    }
  }

  const type = editor.currentBlock?.type
  if (event.key === 'Enter' && !event.shiftKey && (type === 'li' || type === 'ol')) {
    event.preventDefault()
    editor.addNewLine()
    editor.currentBlock!.type = type
    editor.pushHistory('setText')
    return
  }

  if (event.code === 'Space' && editor.currentBlock) {
    const prefix = ({ '#': 'h1', '##': 'h2', '###': 'h3', '-': 'li', '*': 'li', '1.': 'ol' } as Record<string, string>)[
      editor.currentBlock.text
    ]
    if (prefix) {
      editor.currentBlock.type = prefix
      editor.currentBlock.text = ''
      event.preventDefault()
    }
  }
}
</script>

<style lang="scss" scoped>
.mech-rte {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

// The view toggle sits above the box, right-aligned, outside the focus ring.
.mech-rte__switchbar {
  display: flex;
  justify-content: flex-end;
}

// The bordered/filled editing box.
.mech-rte__box {
  display: flex;
  flex-direction: column;
  border-radius: var(--mech-radius);
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;
}

// Full editor (dialog): a clean white document surface with a toolbar on top.
.mech-rte--full .mech-rte__box {
  border: 1px solid var(--mech-input-border);
  background: var(--mech-bg);
  overflow: hidden;

  &:focus-within {
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 3px var(--mech-ring);
  }
}

// Minimal inline field: a soft filled well that lifts to white on focus, like
// the other settings-panel fields.
.mech-rte--minimal .mech-rte__box {
  border: 1px solid transparent;
  background: var(--mech-field-bg);

  &:hover {
    background: var(--mech-field-bg-hover);
  }
  &:focus-within {
    background: var(--mech-bg);
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 3px var(--mech-ring);
  }
}

// Formatting toolbar, inside the box (full + rich view).
.mech-rte__bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  border-bottom: 1px solid var(--mech-border);
}

.mech-rte__divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 4px;
  background: var(--mech-border);
}

// Insert-widget menu (teleported via VPopover; scoped styles still apply because
// the slot content carries this component's data-v attribute).
.mech-rte__insert-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 168px;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--mech-fg);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--mech-hover);
  }
}
.mech-rte__insert-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--mech-muted);

  // Raw-svg widget icons (v-html) — size the inner svg to the chip.
  :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
}

// Segmented Rich / Markdown switch.
.mech-rte__switch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--mech-field-bg);
  border-radius: var(--mech-radius-sm);

  button {
    border: none;
    background: none;
    padding: 3px 10px;
    border-radius: calc(var(--mech-radius-sm) - 2px);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--mech-muted);
    cursor: pointer;

    &:hover {
      color: var(--mech-fg);
    }
    &.is-active {
      background: var(--mech-bg);
      color: var(--mech-fg);
      box-shadow: 0 1px 2px rgba(20, 23, 28, 0.14);
    }
  }
}
// Smaller switch in the minimal field so it reads as a quiet affordance.
.mech-rte--minimal .mech-rte__switch button {
  padding: 2px 8px;
  font-size: 11px;
}

.mech-rte__surface {
  padding: 11px 13px;
  min-height: 64px;
  line-height: 1.6;
  font-size: 14px;
  color: var(--mech-fg);
  outline: none;
  white-space: pre-wrap;
  overflow-y: auto;

  :deep(p) {
    margin: 0 0 0.6em;
  }
  :deep(h1),
  :deep(h2),
  :deep(h3) {
    font-weight: 700;
    margin: 0.85em 0 0.35em;
  }
  :deep(h1) {
    font-size: 1.5em;
  }
  :deep(h2) {
    font-size: 1.3em;
  }
  :deep(h3) {
    font-size: 1.1em;
  }
  // In the editor, list items render as bare <li> (vuewrite's TextEditor doesn't
  // wrap them in <ul>/<ol> — only the viewer does), so each item carries its own
  // left indent to keep the marker inside the editor's padding.
  :deep(ul),
  :deep(ol) {
    margin: 0 0 0.6em;
    padding-left: 0;
  }
  :deep(li) {
    margin: 0.15em 0 0.15em 1.7em;
    list-style: disc;
  }
  :deep(li.ol) {
    list-style: decimal;
  }
  :deep(:last-child) {
    margin-bottom: 0;
  }
  :deep(b) {
    font-weight: 700;
  }
  :deep(i) {
    font-style: italic;
  }
  :deep(u) {
    text-decoration: underline;
  }
  :deep(s) {
    text-decoration: line-through;
  }
  :deep(a) {
    color: var(--mech-accent);
    text-decoration: underline;
  }
  :deep(code) {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    font-size: 0.88em;
    background: var(--mech-field-bg);
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--mech-border);
  }
  :deep(.rt-callout) {
    margin: 0.6em 0;
    padding: 9px 13px;
    border: 1px solid var(--c-border);
    border-left-width: 3px;
    border-radius: var(--mech-radius-sm);
    background: var(--c-soft);
    --c-border: #b9c8f5;
    --c-soft: #eef2fe;
  }
  :deep(.rt-callout--tip) {
    --c-border: #aee0c4;
    --c-soft: #eaf8f0;
  }
  :deep(.rt-callout--warning) {
    --c-border: #f4d39a;
    --c-soft: #fdf4e3;
  }
}
// Minimal field: keep it compact — a bounded box that scrolls, not an
// ever-growing panel.
.mech-rte--minimal .mech-rte__surface {
  min-height: 52px;
  max-height: 220px;
}
.mech-rte--minimal .mech-rte__markdown {
  min-height: 52px;
  max-height: 220px;
  resize: none;
}

.mech-rte__markdown {
  border: none;
  resize: none; // height is managed by autosizeMarkdown(); scrolls when capped
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mech-fg);
  background: none;
  width: 100%;
  box-sizing: border-box;
}

.mech-rte__code {
  margin: 0.4em 0;
  padding: 10px 12px;
  background: var(--mech-field-bg);
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius-sm);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 12.5px;
  overflow-x: auto;
}

.mech-rte__placeholder {
  position: absolute;
  color: var(--mech-placeholder);
  pointer-events: none;
  user-select: none;
}
</style>
