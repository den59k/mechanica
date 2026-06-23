<template>
  <div class="mech-richtext">
    <TextEditor
      :model-value="modelValue ?? [{ text: '' }]"
      class="mech-richtext__inline"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <button v-if="dialog" type="button" class="mech-richtext__expand" @click="openWindow">
      Open in window
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { TextEditor } from 'vuewrite'
import { dialogKey } from '../../ui/dialog'
import RichTextDialog from '../../dialogs/RichTextDialog.vue'

type RichTextBlock = { text: string; type?: string; styles?: unknown[] }

const props = defineProps<{ modelValue?: RichTextBlock[]; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [RichTextBlock[]] }>()

// Degrade gracefully when rendered outside the editor (no dialog host present).
const dialog = inject(dialogKey, null)

// Open the editor in a roomy modal for comfortable typing; changes stream back.
const openWindow = () => {
  dialog?.open(RichTextDialog, {
    title: props.schema.label,
    modelValue: props.modelValue ?? [{ text: '' }],
    'onUpdate:modelValue': (value: RichTextBlock[]) => emit('update:modelValue', value),
  })
}
</script>

<style lang="scss" scoped>
.mech-richtext {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mech-richtext__inline {
  padding: 9px 11px;
  border: 1px solid var(--mech-input-border);
  border-radius: var(--mech-radius-sm);
  min-height: 64px;
  line-height: 1.5;

  &:focus-within {
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 3px var(--mech-ring);
  }
}
.mech-richtext__expand {
  align-self: flex-start;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--mech-accent);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}
</style>
