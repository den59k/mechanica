<template>
  <!-- The inputs live inside vuewrite's contenteditable, whose root listens for
       beforeinput/keydown/clipboard/IME events. Stop those here so typing in the
       code stays in the textarea instead of being inserted into the document. -->
  <div
    class="mech-rt-code"
    contenteditable="false"
    @beforeinput.stop
    @keydown.stop
    @paste.stop
    @copy.stop
    @cut.stop
    @compositionstart.stop
    @compositionend.stop
  >
    <input
      class="mech-rt-code__lang"
      :value="lang"
      placeholder="language"
      spellcheck="false"
      @input="setLang(($event.target as HTMLInputElement).value)"
    />
    <textarea
      ref="ta"
      class="mech-rt-code__text"
      :value="code"
      spellcheck="false"
      placeholder="Code…"
      @input="setCode(($event.target as HTMLTextAreaElement).value)"
      @keydown.tab.prevent="insertTab"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { Block } from 'vuewrite'

const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ change: [] }>()

const code = computed(() => (props.block.text as string) ?? '')
const lang = computed(() => (props.block.lang as string) ?? '')

const ta = ref<HTMLTextAreaElement>()
function autosize(): void {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
onMounted(() => nextTick(autosize))

function setCode(value: string): void {
  ;(props.block as Record<string, unknown>).text = value
  autosize()
  emit('change')
}
function setLang(value: string): void {
  ;(props.block as Record<string, unknown>).lang = value
  emit('change')
}
function insertTab(event: KeyboardEvent): void {
  const el = event.target as HTMLTextAreaElement
  const { selectionStart: s, selectionEnd: e, value } = el
  el.value = `${value.slice(0, s)}  ${value.slice(e)}`
  el.selectionStart = el.selectionEnd = s + 2
  setCode(el.value)
}
</script>

<style lang="scss" scoped>
.mech-rt-code {
  position: relative;
  margin: 0.5em 0;
  border-radius: var(--mech-radius-sm);
  border: 1px solid var(--mech-border);
  background: #1e2230;
  overflow: hidden;
}
.mech-rt-code__lang {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 92px;
  border: none;
  background: none;
  text-align: right;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: #9aa0b4;
  outline: none;

  &::placeholder {
    color: #6a7088;
  }
}
.mech-rt-code__text {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  padding: 12px 14px;
  border: none;
  resize: none;
  background: none;
  color: #e7e9f2;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 12.75px;
  line-height: 1.6;
  outline: none;

  &::placeholder {
    color: #6a7088;
  }
}
</style>
