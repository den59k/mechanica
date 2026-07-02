<template>
  <div class="cta-widget" contenteditable="false">
    <!-- Live preview of what the page will render. -->
    <div class="cta-widget__preview">
      <span class="mc-btn" :class="block.variant === 'ghost' ? 'mc-btn--ghost' : 'mc-btn--primary'">
        {{ (block.label as string) || 'Button' }}
      </span>
    </div>

    <div class="cta-widget__fields">
      <label class="cta-widget__field">
        <span>Label</span>
        <input :value="block.label" placeholder="Get started" @input="set('label', $event)" @change="commit" />
      </label>
      <label class="cta-widget__field">
        <span>Link</span>
        <input :value="block.href" placeholder="/pricing" @input="set('href', $event)" @change="commit" />
      </label>
      <label class="cta-widget__field cta-widget__field--variant">
        <span>Style</span>
        <select :value="(block.variant as string) || 'primary'" @change="setVariant">
          <option value="primary">Primary</option>
          <option value="ghost">Ghost</option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Block } from 'vuewrite'

// The editing face of the `cta` widget: mutate the block directly for a live
// preview, emit `change` once an edit settles so it lands in undo history.
const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ change: [] }>()

const set = (key: string, event: Event): void => {
  ;(props.block as Record<string, unknown>)[key] = (event.target as HTMLInputElement).value
}
const commit = (): void => emit('change')
const setVariant = (event: Event): void => {
  ;(props.block as Record<string, unknown>).variant = (event.target as HTMLSelectElement).value
  emit('change')
}
</script>

<style lang="scss" scoped>
// Editor-side chrome only: consume the editor's --mech-* tokens so the widget
// reads as part of the settings panel. The page look lives in RichTextView.
.cta-widget {
  margin: 0.5em 0;
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  background: var(--mech-bg);
  overflow: hidden;
}
.cta-widget__preview {
  display: flex;
  justify-content: center;
  padding: 14px;
  background: var(--mech-field-bg);

  .mc-btn {
    pointer-events: none;
  }
}
.cta-widget__fields {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--mech-border);
}
.cta-widget__field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;

  span {
    font-size: 11px;
    font-weight: 500;
    color: var(--mech-muted);
  }

  input,
  select {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--mech-input-border);
    border-radius: var(--mech-radius-sm);
    background: var(--mech-bg);
    font: inherit;
    font-size: 12.5px;
    color: var(--mech-fg);
    outline: none;

    &:focus {
      border-color: var(--mech-accent);
      box-shadow: 0 0 0 3px var(--mech-ring);
    }
  }
}
.cta-widget__field--variant {
  flex: 0 0 92px;
}
</style>
