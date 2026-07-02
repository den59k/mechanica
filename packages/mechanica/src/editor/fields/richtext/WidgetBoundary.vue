<template>
  <div v-if="error" class="mech-rte-broken" contenteditable="false" :title="error">
    <VIcon name="info" class="mech-rte-broken__icon" />
    <span>The “{{ label }}” widget failed to render</span>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import VIcon from '../../components/VIcon.vue'

// Error boundary around a widget's editing component: a broken (site-authored)
// widget renders as an inert chip instead of taking the whole editor down.
defineProps<{ label: string }>()

const error = ref('')

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err.message : String(err)
  console.error('[mechanica] Rich-text widget failed to render:', err)
  return false
})
</script>

<style lang="scss" scoped>
.mech-rte-broken {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0.4em 0;
  padding: 9px 12px;
  border: 1px dashed var(--mech-input-border);
  border-radius: var(--mech-radius-sm);
  background: var(--mech-field-bg);
  color: var(--mech-muted);
  font-size: 12.5px;
  user-select: none;
}
.mech-rte-broken__icon {
  width: 14px;
  height: 14px;
  flex: none;
}
</style>
