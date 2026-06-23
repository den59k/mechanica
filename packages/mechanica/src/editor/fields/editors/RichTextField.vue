<template>
  <div class="mech-richtext">
    <TextEditor
      :model-value="modelValue ?? [{ text: '' }]"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { TextEditor } from 'vuewrite'

type RichTextBlock = { text: string; type?: string; styles?: unknown[] }

defineProps<{ modelValue?: RichTextBlock[]; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [RichTextBlock[]] }>()
</script>
