<template>
  <VDialog :title="title ?? 'Edit text'" size="wide">
    <RichTextEditor v-model="model" class="mech-richtext-dialog__editor" />
    <template #actions>
      <button type="button" class="mech-button is-primary" @click="dialog.back()">Done</button>
    </template>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Block } from 'vuewrite'
import VDialog from '../ui/VDialog.vue'
import { useDialog } from '../ui/dialog'
import RichTextEditor from '../fields/richtext/RichTextEditor.vue'

const props = defineProps<{ title?: string; modelValue?: Block[] }>()
const emit = defineEmits<{ 'update:modelValue': [Block[]] }>()

const dialog = useDialog()

// Edit a local copy and stream changes back to the field through the bound
// onUpdate:modelValue handler passed in when the dialog was opened.
const model = ref<Block[]>(props.modelValue ?? [{ text: '' }])
watch(model, (value) => emit('update:modelValue', value), { deep: true })
</script>

<style lang="scss" scoped>
.mech-richtext-dialog__editor {
  min-height: 46vh;

  :deep(.mech-rte__surface) {
    min-height: 40vh;
    max-height: 60vh;
    font-size: 15px;
  }
}
</style>
