<template>
  <div class="mech-modal" :class="`mech-modal--${size}`" role="dialog" aria-modal="true" data-mech-ui>
    <header class="mech-modal__header">
      <h2 class="mech-modal__title"><slot name="header">{{ title }}</slot></h2>
      <button type="button" class="mech-modal__close" aria-label="Close" @click="dialog.back()">
        <VIcon name="close" />
      </button>
    </header>
    <div class="mech-modal__body">
      <slot />
    </div>
    <footer v-if="$slots.actions" class="mech-modal__actions">
      <slot name="actions" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useDialog } from './dialog'
import VIcon from '../components/VIcon.vue'

withDefaults(defineProps<{ title?: string; size?: 'standard' | 'wide' }>(), { size: 'standard' })
const dialog = useDialog()
</script>

<style lang="scss" scoped>
.mech-modal {
  display: flex;
  flex-direction: column;
  max-height: 84vh;
  width: 100%;
  background: var(--mech-bg);
  border-radius: 18px;
  box-shadow: var(--mech-shadow-dialog);
  overflow: hidden;

  &--standard {
    max-width: 560px;
  }
  &--wide {
    max-width: 880px;
  }
}
// Airy, divider-free chrome — structure comes from spacing, not hard rules.
.mech-modal__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 14px 12px 24px;
  flex: none;
}
.mech-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  width: 34px;
  height: 34px;
  border: none;
  background: none;
  color: var(--mech-muted);
  border-radius: var(--mech-radius-pill);
  cursor: pointer;

  .vicon {
    width: 18px;
    height: 18px;
  }
  &:hover {
    background: var(--mech-hover);
    color: var(--mech-fg);
  }
}
.mech-modal__body {
  padding: 4px 24px 24px;
  overflow-y: auto;
}
.mech-modal__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 24px 18px;
  flex: none;
}
</style>
