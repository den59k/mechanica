<template>
  <div class="mech-multiselect">
    <div class="mech-tags">
      <span v-for="(tag, index) in list" :key="index" class="mech-tag">
        {{ tag }}
        <button type="button" @click="remove(index)">×</button>
      </span>
    </div>
    <input
      class="mech-input"
      :placeholder="schema.placeholder ?? 'Add and press Enter'"
      @keydown.enter.prevent="addFromEvent"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ modelValue?: string[]; schema: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const list = computed<string[]>(() => props.modelValue ?? [])

const addFromEvent = (event: KeyboardEvent) => {
  const input = event.target as HTMLInputElement
  const value = input.value.trim()
  if (!value) return
  emit('update:modelValue', [...list.value, value])
  input.value = ''
}

const remove = (index: number) =>
  emit('update:modelValue', list.value.filter((_, i) => i !== index))
</script>
