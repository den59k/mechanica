<template>
  <Teleport to="body">
    <!-- A single dim that fades in/out once per "any dialog open" — so opening a
         second dialog over the first never flickers the overlay. -->
    <Transition name="mech-dim">
      <div v-if="store.stack.length" class="mech-dialog-dim" data-mech-ui />
    </Transition>

    <!-- The whole stack stays mounted (only the top is interactive) so opening a
         dialog from within a dialog — e.g. the image picker over the rich-text
         editor — never unmounts the dialog beneath it and loses its state. -->
    <TransitionGroup name="mech-dialog" tag="div" class="mech-dialog-layer" data-mech-ui>
      <div
        v-for="(entry, i) in store.stack"
        :key="entry.id"
        class="mech-dialog-backdrop"
        :class="{ 'is-stacked': i > 0 }"
        :inert="i !== store.stack.length - 1"
        @mousedown="onDown"
        @mouseup="onUp($event, i)"
      >
        <component :is="entry.component" v-bind="entry.props" />
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose } from 'vue'
import { useDialog } from './dialog'

const store = useDialog()

// Only dismiss when the press starts AND ends on the (top) backdrop itself, so a
// drag that ends outside the panel doesn't accidentally close it.
let downOnBackdrop = false
const onDown = (event: MouseEvent) => {
  downOnBackdrop = event.target === event.currentTarget
}
const onUp = (event: MouseEvent, index: number) => {
  if (index !== store.stack.length - 1) return
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
.mech-dialog-dim {
  position: fixed;
  inset: 0;
  z-index: 2147483500;
  background: rgba(15, 18, 22, 0.45);
}
.mech-dim-enter-active,
.mech-dim-leave-active {
  transition: opacity 0.16s ease;
}
.mech-dim-enter-from,
.mech-dim-leave-to {
  opacity: 0;
}

.mech-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483501;
  pointer-events: none; // the backdrops opt back in
  font-family: var(--mech-font);
  color: var(--mech-fg);
}
.mech-dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 16px;
  box-sizing: border-box;
  pointer-events: auto;

  // A dialog stacked over another gets its own light veil, so it visually
  // detaches from the (equally white) dialog beneath it. The full-strength
  // dim over the page itself is the single element above.
  &.is-stacked {
    background: rgba(15, 18, 22, 0.28);
  }
}

// Each dialog panel fades + scales on enter/leave (the dim is handled above).
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
