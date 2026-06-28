<template>
  <div class="mech-rte">
    <div class="mech-rte__toolbar">
      <select
        class="mech-rte__type"
        :value="blockType"
        :disabled="mode === 'markdown'"
        title="Block type"
        @change="setBlockType(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="t in blockTypes" :key="t.id" :value="t.id">{{ t.title }}</option>
        <option v-if="blockType === 'mixed'" value="mixed" disabled>Mixed</option>
      </select>

      <span class="mech-rte__divider" />

      <button
        v-for="b in styleButtons"
        :key="b.style"
        type="button"
        class="mech-rte__btn"
        :class="{ 'is-active': b.active }"
        :disabled="mode === 'markdown'"
        :title="b.title"
        @mousedown.prevent
        @click="toggleStyle(b.style)"
      >
        <VIcon :name="b.icon" />
      </button>

      <span class="mech-rte__spacer" />

      <div class="mech-rte__switch" role="tablist">
        <button type="button" :class="{ 'is-active': mode === 'rich' }" @click="mode = 'rich'">Rich</button>
        <button type="button" :class="{ 'is-active': mode === 'markdown' }" @click="setMarkdownMode">Markdown</button>
      </div>
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
      <template #code="{ block }">
        <pre class="mech-rte__code" :contenteditable="false"><code>{{ block.text }}</code></pre>
      </template>
      <template #placeholder>
        <div class="mech-rte__placeholder" :contenteditable="false">{{ placeholder }}</div>
      </template>
    </TextEditor>

    <textarea
      v-else
      class="mech-rte__surface mech-rte__markdown"
      :value="markdown"
      spellcheck="false"
      :placeholder="placeholder"
      @input="onMarkdownInput"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { TextEditor, uid } from 'vuewrite'
import type { Block, TextEditorRef } from 'vuewrite'
import { blocksToMarkdown, markdownToBlocks } from 'vuewrite/markdown'
import VIcon from '../../components/VIcon.vue'
import { renderer, decorator, htmlParser, blockTypes } from './config'

const props = withDefaults(defineProps<{ modelValue?: Block[]; placeholder?: string }>(), {
  placeholder: 'Write…',
})
const emit = defineEmits<{ 'update:modelValue': [Block[]] }>()

const editorRef = shallowRef<TextEditorRef>()
const mode = ref<'rich' | 'markdown'>('rich')

/** Always edit a non-empty document so vuewrite has a focusable block. */
const blank = (): Block[] => [{ id: uid(), text: '' }]
const model = ref<Block[]>(props.modelValue?.length ? props.modelValue : blank())

// vuewrite mutates the document reactively; mirror every change up to the field.
watch(model, (value) => emit('update:modelValue', value), { deep: true })

// ── Block type ────────────────────────────────────────────────────────────────

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

// ── WYSIWYG ⇄ Markdown switch ───────────────────────────────────────────────────

const markdown = ref('')
let fromMarkdown = false

function setMarkdownMode(): void {
  markdown.value = blocksToMarkdown(model.value, { softBreaks: true })
  mode.value = 'markdown'
}

watch(
  model,
  (blocks) => {
    if (!fromMarkdown && mode.value === 'markdown') markdown.value = blocksToMarkdown(blocks, { softBreaks: true })
  },
  { deep: true },
)

function onMarkdownInput(event: Event): void {
  const md = (event.target as HTMLTextAreaElement).value
  markdown.value = md
  fromMarkdown = true
  model.value = markdownToBlocks(md, model.value, { softBreaks: true })
  nextTick(() => (fromMarkdown = false))
}

// ── Keyboard: format shortcuts + Markdown prefixes + list continuation ──────────

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
  border: 1px solid var(--mech-input-border);
  border-radius: var(--mech-radius-sm);
  overflow: hidden;
  background: var(--mech-input-bg, #fff);

  &:focus-within {
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 3px var(--mech-ring);
  }
}

.mech-rte__toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  border-bottom: 1px solid var(--mech-border);
  background: var(--mech-surface);
}

.mech-rte__type {
  height: 26px;
  border: 1px solid var(--mech-input-border);
  border-radius: var(--mech-radius-sm);
  background: #fff;
  font: inherit;
  font-size: 12px;
  padding: 0 4px;
  color: var(--mech-ink);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.mech-rte__divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 4px;
  background: var(--mech-border);
}

.mech-rte__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  color: var(--mech-muted);
  cursor: pointer;
  font-size: 16px;

  &:hover:not(:disabled) {
    background: var(--mech-hover);
    color: var(--mech-ink);
  }

  &.is-active {
    background: var(--mech-accent-soft, var(--mech-hover));
    color: var(--mech-accent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.mech-rte__spacer {
  flex: 1 1 auto;
}

.mech-rte__switch {
  display: inline-flex;
  border: 1px solid var(--mech-input-border);
  border-radius: var(--mech-radius-sm);
  overflow: hidden;

  button {
    border: none;
    background: #fff;
    font: inherit;
    font-size: 12px;
    padding: 3px 10px;
    color: var(--mech-muted);
    cursor: pointer;

    &.is-active {
      background: var(--mech-ink);
      color: #fff;
    }
  }
}

.mech-rte__surface {
  padding: 10px 12px;
  min-height: 72px;
  line-height: 1.6;
  font-size: 14px;
  color: var(--mech-ink);
  outline: none;
  white-space: pre-wrap;
  overflow-y: auto;

  :deep(h1) {
    font-size: 1.5em;
    font-weight: 700;
    margin: 0.4em 0;
  }
  :deep(h2) {
    font-size: 1.3em;
    font-weight: 700;
    margin: 0.4em 0;
  }
  :deep(h3) {
    font-size: 1.1em;
    font-weight: 700;
    margin: 0.4em 0;
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
    background: var(--mech-surface);
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--mech-border);
  }
  :deep(li) {
    margin-left: 1.4em;
    list-style: disc;
  }
  :deep(li.ol) {
    list-style: decimal;
  }
}

.mech-rte__markdown {
  border: none;
  resize: vertical;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 13px;
  background: none;
  width: 100%;
  box-sizing: border-box;
}

.mech-rte__code {
  margin: 0.4em 0;
  padding: 10px 12px;
  background: var(--mech-surface);
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius-sm);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 12.5px;
  overflow-x: auto;
}

.mech-rte__placeholder {
  position: absolute;
  opacity: 0.4;
  pointer-events: none;
  user-select: none;
}
</style>
