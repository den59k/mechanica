<template>
  <div class="mech-composer__colorfield">
    <span class="mech-composer__color">
      <input type="color" :value="asColor(modelValue)" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      <input
        type="text"
        class="mech-composer__input"
        :value="modelValue == null ? '' : String(modelValue)"
        :placeholder="placeholder"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value || undefined)"
      />
    </span>
    <div v-if="tokens.length" class="mech-composer__tokens">
      <button
        v-for="t in tokens"
        :key="t.name"
        type="button"
        class="mech-composer__token"
        :class="{ 'is-active': modelValue === `var(--${t.name})` }"
        :style="{ background: t.value }"
        :title="`--${t.name}`"
        @click="emit('update:modelValue', `var(--${t.name})`)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { colorTokens } from '../lib/design-tokens'

defineProps<{ modelValue: unknown; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()

const tokens = colorTokens()
const asColor = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#ffffff')
</script>
