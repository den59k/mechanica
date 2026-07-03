<template>
  <Teleport to="body">
    <div v-if="menu.open" data-mech-ui>
      <!-- Full-screen catcher: any click / right-click / scroll dismisses the menu. -->
      <div
        class="mech-ctx__scrim"
        @pointerdown="menu.close()"
        @contextmenu.prevent="menu.close()"
        @wheel="menu.close()"
      />
      <div class="mech-ctx" :style="panelStyle" @contextmenu.prevent>
        <template v-for="(item, i) in menu.items" :key="i">
          <div v-if="item.separatorBefore && i > 0" class="mech-ctx__sep" />
          <button
            type="button"
            class="mech-ctx__item"
            :class="{ 'is-danger': item.danger, 'is-disabled': item.disabled, 'is-active': active === i }"
            :data-index="i"
            @mouseenter="onEnter(i)"
            @click="run(item)"
          >
            <span class="mech-ctx__label">{{ item.label }}</span>
            <span v-if="item.checked" class="mech-ctx__check">✓</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { contextMenuKey, type ContextMenuItem } from '../lib/context-menu'

const menu = inject(contextMenuKey)!

const WIDTH = 190
const ITEM_H = 30
const SEP_H = 9
const PAD = 8
const EDGE = 8

const active = ref(-1)

// Clamp the cursor-anchored panel inside the viewport (it may flip up/left).
const panelStyle = computed(() => {
  const seps = menu.items.filter((it, i) => it.separatorBefore && i > 0).length
  const height = menu.items.length * ITEM_H + seps * SEP_H + PAD
  const left = Math.max(EDGE, Math.min(menu.x, window.innerWidth - WIDTH - EDGE))
  const top = Math.max(EDGE, Math.min(menu.y, window.innerHeight - height - EDGE))
  return { left: `${left}px`, top: `${top}px`, minWidth: `${WIDTH}px` }
})

const onEnter = (i: number) => {
  if (!menu.items[i]?.disabled) active.value = i
}
const run = (item: ContextMenuItem) => {
  if (item.disabled) return
  menu.close()
  item.onClick?.()
}

const move = (dir: number) => {
  const n = menu.items.length
  if (!n) return
  let i = active.value
  for (let k = 0; k < n; k++) {
    i = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n
    if (!menu.items[i]?.disabled) {
      active.value = i
      return
    }
  }
}
const activate = () => {
  const item = menu.items[active.value]
  if (item) run(item)
}

// While open, own the keyboard on the capture phase, so arrows/Enter/Escape act
// on the menu — and Escape closes it rather than deselecting the block.
const onKey = (event: KeyboardEvent) => {
  if (!menu.open) return
  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      menu.close()
      break
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Enter':
      event.preventDefault()
      activate()
      break
  }
}
watch(
  () => menu.open,
  (open) => {
    active.value = -1
    if (open) document.addEventListener('keydown', onKey, true)
    else document.removeEventListener('keydown', onKey, true)
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))
</script>

<style lang="scss" scoped>
.mech-ctx__scrim {
  position: fixed;
  inset: 0;
  z-index: 2147483650;
}
.mech-ctx {
  position: fixed;
  z-index: 2147483651;
  padding: 4px;
  background: var(--mech-bg);
  border: 1px solid var(--mech-border);
  border-radius: var(--mech-radius);
  box-shadow: var(--mech-shadow-pop);
  user-select: none;
  font-family: var(--mech-font);
  transform-origin: top left;
  animation: mech-ctx-in 0.12s ease-out;
}
@keyframes mech-ctx-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}
.mech-ctx__item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: transparent;
  color: var(--mech-fg-alt);
  font: inherit;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;

  &.is-active {
    background: var(--mech-hover);
    color: var(--mech-fg);
  }
  &.is-danger {
    color: var(--mech-error);
  }
  &.is-danger.is-active {
    background: color-mix(in srgb, var(--mech-error) 10%, transparent);
  }
  &.is-disabled {
    color: var(--mech-placeholder);
    cursor: default;

    &.is-active {
      background: transparent;
    }
  }
}
.mech-ctx__label {
  flex: 1;
}
.mech-ctx__check {
  margin-left: 12px;
  color: var(--mech-muted);
}
.mech-ctx__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--mech-border);
}
</style>
