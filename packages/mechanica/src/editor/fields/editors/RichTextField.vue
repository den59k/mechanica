<template>
  <div class="mech-richtext-field">
    <RichTextEditor :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <button v-if="dialog" type="button" class="mech-richtext-field__expand" @click="openWindow">
      Open in window
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import type { Block } from 'vuewrite'
import { dialogKey } from '../../ui/dialog'
import RichTextDialog from '../../dialogs/RichTextDialog.vue'
import RichTextEditor from '../richtext/RichTextEditor.vue'

const props = defineProps<{ modelValue?: Block[]; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [Block[]] }>()

// Degrade gracefully when rendered outside the editor (no dialog host present).
const dialog = inject(dialogKey, null)

// Open the editor in a roomy modal for comfortable typing; changes stream back.
const openWindow = () => {
  dialog?.open(RichTextDialog, {
    title: props.schema.label,
    modelValue: props.modelValue ?? [{ text: '' }],
    'onUpdate:modelValue': (value: Block[]) => emit('update:modelValue', value),
  })
}
</script>

<style lang="scss" scoped>
.mech-richtext-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mech-richtext-field__expand {
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
