<template>
  <div class="mech-composer__aligngrid" role="group" aria-label="Alignment">
    <button
      v-for="cell in cells"
      :key="cell.key"
      type="button"
      class="mech-composer__aligncell"
      :class="{ 'is-active': cell.active }"
      :style="cell.style"
      :title="cell.title"
      @click="apply(cell.align, cell.justify)"
    >
      <span class="mech-composer__aligndot" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { composerStoreKey } from '../lib/keys'

const props = defineProps<{ node: ContentBlock }>()
const store = inject(composerStoreKey)!

const POS = ['start', 'center', 'end'] as const
const CSS = ['flex-start', 'center', 'flex-end']

const direction = computed(() => (store.effective(props.node, 'direction') === 'row' ? 'row' : 'column'))
const curAlign = computed(() => store.effective(props.node, 'align') ?? 'stretch')
const curJustify = computed(() => store.effective(props.node, 'justify') ?? 'start')

// A 3×3 matrix. The dot's on-screen position (row = vertical, col = horizontal)
// is purely visual; the align/justify it applies is derived from the frame's
// direction, so the grid reads the same way Figma's does whichever way the
// frame flows.
const cells = computed(() =>
  [0, 1, 2].flatMap((row) =>
    [0, 1, 2].map((col) => {
      const align = direction.value === 'row' ? POS[row]! : POS[col]!
      const justify = direction.value === 'row' ? POS[col]! : POS[row]!
      return {
        key: `${row}-${col}`,
        align,
        justify,
        active: curAlign.value === align && curJustify.value === justify,
        title: `Align ${align} · justify ${justify}`,
        style: { justifyContent: CSS[col], alignItems: CSS[row] },
      }
    }),
  ),
)

function apply(align: string, justify: string) {
  store.setData(props.node.id, { align, justify }, { responsive: true })
}
</script>
