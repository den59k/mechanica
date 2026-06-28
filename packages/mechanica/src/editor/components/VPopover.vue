<template>
  <Teleport to="body">
    <!-- Entrance-only (no leave transition) so the panel is removed immediately on
         close — callers and tests detect "open" by the panel's presence. -->
    <div
      v-if="open"
      ref="panelRef"
      class="mech-popover"
      :class="panelClass"
      data-mech-ui
      :style="style"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Visibility (v-model). The caller owns it; the popover only requests close. */
    open: boolean
    /** Element to anchor against and treat as "inside" for outside-click. */
    anchor: HTMLElement | null
    /** Match the anchor's width — for selects / comboboxes. */
    matchWidth?: boolean
    offset?: number
    maxHeight?: number
    /** Extra class on the panel (e.g. a marker the field/tests target). */
    panelClass?: string
  }>(),
  { matchWidth: false, offset: 6, maxHeight: 280 },
)
const emit = defineEmits<{ 'update:open': [boolean] }>()

const panelRef = ref<HTMLElement | null>(null)
const style = ref<Record<string, string>>({})

const close = () => emit('update:open', false)

// Anchor the teleported panel under the trigger, flipping above when space is
// tight and clamping its height.
function position() {
  const el = props.anchor
  if (!el) return
  const rect = el.getBoundingClientRect()
  const MARGIN = 8
  const max = props.maxHeight
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN
  const spaceAbove = rect.top - MARGIN
  const flip = spaceBelow < Math.min(max, 200) && spaceAbove > spaceBelow
  const maxHeight = Math.max(120, Math.min(max, flip ? spaceAbove : spaceBelow))
  style.value = {
    left: `${Math.round(rect.left)}px`,
    ...(props.matchWidth ? { width: `${Math.round(rect.width)}px` } : {}),
    maxHeight: `${Math.round(maxHeight)}px`,
    ...(flip
      ? { bottom: `${Math.round(window.innerHeight - rect.top + props.offset)}px` }
      : { top: `${Math.round(rect.bottom + props.offset)}px` }),
  }
}

// Clicking outside both the anchor and the panel closes it; Escape closes it
// (capture + stopPropagation so it wins over a surrounding dialog / shortcut).
const onDocPointer = (event: PointerEvent) => {
  const target = event.target as Node
  if (props.anchor?.contains(target) || panelRef.value?.contains(target)) return
  close()
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}
const reposition = () => position()

function attach() {
  window.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
}
function detach() {
  window.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick() // wait for the panel to mount before measuring
      position()
      attach()
    } else {
      detach()
    }
  },
  { immediate: true },
)
onBeforeUnmount(detach)
</script>

<style lang="scss" scoped>
.mech-popover {
  position: fixed;
  // Above dialogs (2147483500) so selects/comboboxes opened inside a dialog show.
  z-index: 2147483680;
  overflow-y: auto;
  padding: 5px;
  background: var(--mech-bg);
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  box-shadow: var(--mech-shadow-pop);
  font-family: var(--mech-font);
  animation: mech-popover-in 0.12s ease;
}
@keyframes mech-popover-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
