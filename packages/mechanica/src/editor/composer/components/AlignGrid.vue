<template>
  <div class="mech-composer__aligngrid" role="group" aria-label="Alignment">
    <button
      v-for="cell in cells"
      :key="cell.key"
      type="button"
      class="mech-composer__aligncell"
      :class="{ 'is-active': cell.active }"
      :title="cell.title"
      @click="apply(cell.align, cell.justify)"
    >
      <!-- A calm dot by default (accent marks the active alignment); on hover the
           cell previews the alignment as three Figma-style stripes standing in for
           the frame's children, aligned exactly as this cell would align them.
           Orientation flips with the frame's flow; the cell's flex places + aligns
           them per align/justify. -->
      <span class="mech-composer__aligndot" />
      <span class="mech-composer__alignbars" :class="dirClass" :style="cell.barsStyle">
        <i class="mech-composer__alignbar" />
        <i class="mech-composer__alignbar" />
        <i class="mech-composer__alignbar" />
      </span>
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

// Column frames stack horizontal bars; row frames sit vertical bars side by side.
const dirClass = computed(() => (direction.value === 'row' ? 'is-row' : 'is-col'))

// A 3×3 matrix. The cell's on-screen position (row = vertical, col = horizontal)
// is purely visual; the align/justify it applies is derived from the frame's
// direction, so the grid reads the same way Figma's does whichever way the frame
// flows. Each cell's bars are aligned by `align` (cross axis) and grouped by
// `justify` (main axis) — a real preview of that alignment.
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
        barsStyle: {
          flexDirection: direction.value === 'row' ? 'row' : 'column',
          alignItems: CSS[POS.indexOf(align)]!,
          justifyContent: CSS[POS.indexOf(justify)]!,
        },
      }
    }),
  ),
)

function apply(align: string, justify: string) {
  store.setData(props.node.id, { align, justify }, { responsive: true })
}
</script>
