<template>
  <div class="mech-typo">
    <textarea
      v-if="multiline"
      ref="fieldRef"
      class="mech-input mech-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      @input="onInput"
      @keydown="onKeyDown"
      @scroll="syncScroll"
    />
    <input
      v-else
      ref="fieldRef"
      class="mech-input"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      @input="onInput"
      @keydown="onKeyDown"
      @scroll="syncScroll"
    />
    <!-- Marker layer: a transparent mirror of the text sitting exactly over the
         field, lighting up the two invisible non-breaking characters. Metrics
         mirror .mech-input so the glyphs line up; pointer-events:none keeps the
         real field fully interactive underneath. -->
    <div
      ref="overlayRef"
      class="mech-typo__overlay"
      :class="multiline ? 'is-multiline' : 'is-single'"
      aria-hidden="true"
      v-html="highlighted"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { highlightTypographyHtml, insertAtCursor, typographyCharForEvent } from '../lib/typography'

const props = withDefaults(
  defineProps<{ modelValue?: string; multiline?: boolean; placeholder?: string; rows?: number }>(),
  { rows: 3 },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const fieldRef = ref<HTMLInputElement | HTMLTextAreaElement>()
const overlayRef = ref<HTMLElement>()

const highlighted = computed(() => highlightTypographyHtml(props.modelValue ?? ''))

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value)
  nextTick(syncScroll)
}

// Ctrl/Cmd+Shift+Space → nbsp, Ctrl/Cmd+Shift+Minus → non-breaking hyphen.
function onKeyDown(event: KeyboardEvent): void {
  const char = typographyCharForEvent(event)
  if (!char) return
  event.preventDefault()
  const el = fieldRef.value
  if (!el) return
  emit('update:modelValue', insertAtCursor(el, char))
  nextTick(syncScroll)
}

// The overlay is a separate scroll box; keep it locked to the field's scroll so
// the markers stay glued to their characters as the text scrolls.
function syncScroll(): void {
  const el = fieldRef.value
  const overlay = overlayRef.value
  if (!el || !overlay) return
  overlay.scrollTop = el.scrollTop
  overlay.scrollLeft = el.scrollLeft
}
</script>

<style lang="scss" scoped>
.mech-typo {
  position: relative;
  display: block;
  width: 100%;
}

// Transparent mirror layer. Its box metrics (border/padding/font) match
// .mech-input so each character sits at the same x/y as in the real field.
.mech-typo__overlay {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 1px solid transparent;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
  color: transparent;
  font: inherit;
  font-size: 13.5px;

  &.is-single {
    padding: 0 12px;
    // Content-box height (38px field − 2×1px border) → the single line centers
    // vertically the same way an <input> centers its text.
    line-height: 36px;
    white-space: pre;
  }
  &.is-multiline {
    padding: 9px 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  // The glue markers. A translucent tint (not a solid fill) so the real field's
  // text — notably the non-breaking hyphen's glyph — stays visible underneath.
  :deep(.mech-typo__nbsp),
  :deep(.mech-typo__nbhyphen) {
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--mech-accent) 15%, transparent);
  }
  // nbsp is a blank in the field, so also paint a small centered dot — the
  // classic "visible whitespace" cue, saying "there's a space, and it's tied".
  :deep(.mech-typo__nbsp) {
    background-image: radial-gradient(circle at center, var(--mech-accent) 0 1px, transparent 1.4px);
    background-repeat: no-repeat;
    background-position: center;
  }
}
</style>
