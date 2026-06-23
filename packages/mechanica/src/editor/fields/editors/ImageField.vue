<template>
  <div class="mech-image">
    <img v-if="value.src" :src="value.src" class="mech-image__preview" alt="" />
    <div class="mech-image__controls">
      <input
        class="mech-input"
        type="text"
        :value="value.src"
        placeholder="Image URL"
        @input="setSrc(($event.target as HTMLInputElement).value)"
      />
      <button v-if="uploader" type="button" class="mech-button" @click="pick">Upload</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'

interface ImageValue {
  src: string
  previewSrc?: string
}
type Uploader = (file: File) => Promise<{ src: string; previewSrc?: string }>

const props = defineProps<{ modelValue?: ImageValue; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [ImageValue] }>()

const value = computed<ImageValue>(() => props.modelValue ?? { src: '' })
const uploader = inject<Uploader | null>('mechFileUploader', null)

const setSrc = (src: string) => emit('update:modelValue', { ...value.value, src })

const pick = () => {
  if (!uploader) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const result = await uploader(file)
    emit('update:modelValue', { src: result.src, previewSrc: result.previewSrc ?? result.src })
  }
  input.click()
}
</script>
