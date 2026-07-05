<template>
  <div class="mech-stylehint">
    <template v-if="decls.length">
      <div class="mech-stylehint__title">{{ option?.label }}</div>
      <!-- The real CSS class name, as written in code — greppable, the dev↔designer bridge. -->
      <code class="mech-stylehint__selector">.{{ cls }}</code>
      <div v-for="d in decls" :key="d.prop" class="mech-stylehint__row">
        <span class="mech-stylehint__prop">{{ d.prop }}</span>
        <span class="mech-stylehint__val">
          {{ d.value }}<em v-if="d.resolved" class="mech-stylehint__resolved"> → {{ d.resolved }}</em>
        </span>
      </div>
    </template>
    <p v-else class="mech-stylehint__empty">{{ emptyLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SelectOption } from '../../components/VSelect.vue'
import { readClassDeclarations } from '../lib/class-css'

// Previews the CSS a design-system class provides, read live from the CSSOM. The
// hosting VSelect renders one instance for the hovered/active option, so this
// reads the stylesheet only for the option in focus.
const props = defineProps<{ option: SelectOption | null }>()

const cls = computed(() => (props.option?.value ? String(props.option.value) : ''))
const decls = computed(() => readClassDeclarations(cls.value))
const emptyLabel = computed(() => {
  if (!props.option) return 'Hover a style to preview'
  if (!cls.value) return 'No style applied'
  return 'No CSS found for this class'
})
</script>

<style lang="scss" scoped>
.mech-stylehint {
  width: 208px;
  padding: 4px 2px 4px 10px;
  font-size: 12px;
  line-height: 1.5;
}
.mech-stylehint__title {
  margin-bottom: 2px;
  font-weight: 600;
  font-size: 12.5px;
  color: var(--mech-fg);
}
.mech-stylehint__selector {
  display: block;
  margin-bottom: 7px;
  font-family: var(--mech-font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--mech-muted);
}
.mech-stylehint__row {
  display: flex;
  flex-direction: column;
  padding: 2px 0;
}
.mech-stylehint__prop {
  color: var(--mech-muted);
  font-family: var(--mech-font-mono, ui-monospace, monospace);
  font-size: 11px;
}
.mech-stylehint__val {
  color: var(--mech-fg);
  font-family: var(--mech-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  word-break: break-word;
}
.mech-stylehint__resolved {
  color: var(--mech-accent);
  font-style: normal;
}
.mech-stylehint__empty {
  margin: 0;
  color: var(--mech-muted);
  font-style: italic;
}
</style>
