<template>
  <div class="mech-smartlink">
    <input
      class="mech-input"
      type="text"
      :value="value.url"
      placeholder="URL or /path"
      @input="patch('url', ($event.target as HTMLInputElement).value)"
    />
    <input
      class="mech-input"
      type="text"
      :value="value.title"
      placeholder="Title"
      @input="patch('title', ($event.target as HTMLInputElement).value)"
    />
    <div class="mech-smartlink__flags">
      <label class="mech-checkbox">
        <input type="checkbox" :checked="value.external" @change="patch('external', ($event.target as HTMLInputElement).checked)" />
        <span>External</span>
      </label>
      <label class="mech-checkbox">
        <input type="checkbox" :checked="value.openNewTab" @change="patch('openNewTab', ($event.target as HTMLInputElement).checked)" />
        <span>New tab</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface LinkValue {
  url: string
  title: string
  external?: boolean
  openNewTab?: boolean
}

const props = defineProps<{ modelValue?: Partial<LinkValue>; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [LinkValue] }>()

const value = computed<LinkValue>(() => ({ url: '', title: '', ...props.modelValue }))
const patch = (key: keyof LinkValue, val: unknown) =>
  emit('update:modelValue', { ...value.value, [key]: val })
</script>
