<template>
  <Teleport to="body">
    <Transition name="mech-dialog">
      <div
        v-if="store.stack.length"
        class="mech-dialog-backdrop"
        data-mech-ui
        @mousedown="onDown"
        @mouseup="onUp"
      >
        <component :is="top.component" v-bind="top.props" :key="store.stack.length" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose } from 'vue'
import { useDialog } from './dialog'

const store = useDialog()
const top = computed(() => store.stack[store.stack.length - 1]!)

// Only dismiss when the press starts AND ends on the backdrop itself (so a
// drag that ends outside the panel doesn't accidentally close it).
let downOnBackdrop = false
const onDown = (event: MouseEvent) => {
  downOnBackdrop = event.target === event.currentTarget
}
const onUp = (event: MouseEvent) => {
  if (downOnBackdrop && event.target === event.currentTarget) store.back()
}

// Escape closes the top dialog. Capture phase + stopPropagation so it wins over
// the editor's global shortcut handler (which would otherwise deselect).
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && store.stack.length) {
    event.stopPropagation()
    store.back()
  }
}
onMounted(() => document.addEventListener('keydown', onKey, true))
onScopeDispose(() => document.removeEventListener('keydown', onKey, true))
</script>

<style lang="scss" scoped>
.mech-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483500;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 16px;
  box-sizing: border-box;
  background: rgba(15, 18, 22, 0.45);
  font-family: var(--mech-font);
  color: var(--mech-fg);
}

// Transition (the panel scale lives on .mech-modal via the backdrop state).
.mech-dialog-enter-active,
.mech-dialog-leave-active {
  transition: opacity 0.16s ease;

  :deep(.mech-modal) {
    transition: transform 0.16s cubic-bezier(0, 0, 0.2, 1);
  }
}
.mech-dialog-enter-from,
.mech-dialog-leave-to {
  opacity: 0;

  :deep(.mech-modal) {
    transform: scale(0.94) translateY(8px);
  }
}
</style>
