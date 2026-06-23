<template>
  <VDialog :title="title ?? 'Edit text'" size="wide">
    <div class="mech-richtext-dialog">
      <TextEditor
        :model-value="model"
        class="mech-richtext-dialog__editor"
        @update:model-value="model = $event"
      />
    </div>
    <template #actions>
      <button type="button" class="mech-button is-primary" @click="dialog.back()">Done</button>
    </template>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { TextEditor } from 'vuewrite'
import VDialog from '../ui/VDialog.vue'
import { useDialog } from '../ui/dialog'

type RichTextBlock = { text: string; type?: string; styles?: unknown[] }

const props = defineProps<{ title?: string; modelValue?: RichTextBlock[] }>()
const emit = defineEmits<{ 'update:modelValue': [RichTextBlock[]] }>()

const dialog = useDialog()

// Edit a local copy and stream changes back to the field through the bound
// onUpdate:modelValue handler passed in when the dialog was opened.
const model = ref<RichTextBlock[]>(props.modelValue ?? [{ text: '' }])
watch(model, (value) => emit('update:modelValue', value), { deep: true })
</script>

<style lang="scss" scoped>
.mech-richtext-dialog__editor {
  min-height: 46vh;
  max-height: 64vh;
  overflow-y: auto;
  padding: 14px 16px;
  border: 1px solid var(--mech-input-border);
  border-radius: var(--mech-radius);
  line-height: 1.6;

  &:focus-within {
    border-color: var(--mech-accent);
    box-shadow: 0 0 0 3px var(--mech-ring);
  }
}
</style>
