<template>
  <section v-if="template" class="mech-template-note" aria-label="Page template">
    <div class="mech-editor__heading"><span>Page template</span></div>
    <div class="mech-template-note__name">
      <VIcon v-if="meta?.icon" :name="meta.icon" class="mech-template-note__icon" />
      <span class="mech-template-note__label">{{ meta?.name ?? template.blockId }}</span>
    </div>
    <p class="mech-template-note__hint">{{ hint }}</p>
    <div v-if="canChange || composable" class="mech-template-note__actions">
      <button v-if="canChange" type="button" class="mech-template-note__action" @click="emit('change')">
        Change template
      </button>
      <button v-if="composable" type="button" class="mech-template-note__action" @click="emit('compose')">
        Edit in the composer
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { editorStoreKey } from '../lib/store'
import VIcon from './VIcon.vue'

/**
 * The left panel of a template page whose template has no slots: the block is
 * the whole page, so there is no tree to show. A short note says what the page
 * is instead; its props stay in the settings panel on the right.
 */
const props = defineProps<{
  /** Whether the Page data dialog (where the template is picked) exists here. */
  canChange: boolean
  /** Whether the host has a composer, for a template designed in it. */
  canCompose: boolean
}>()
const emit = defineEmits<{ change: []; compose: [] }>()

const store = inject(editorStoreKey)!

const template = computed(() => store.pageBlock)
const meta = computed(() => (template.value ? store.blocksById.get(template.value.blockId) : undefined))
const composable = computed(() => props.canCompose && meta.value?.composed === true)

const hint = computed(() => {
  const origin = meta.value?.composed ? 'This page is designed in the composer.' : 'This page comes from code.'
  const fields = (meta.value?.props as { properties?: Record<string, unknown> } | undefined)?.properties
  return fields && Object.keys(fields).length ? `${origin} Edit its properties on the right.` : origin
})
</script>

<style lang="scss" scoped>
// Sits where the tree would: flush with the tree rows' 4px inset.
.mech-template-note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  padding: 0 4px;
}
.mech-editor__heading {
  margin-bottom: 2px;
}
.mech-template-note__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.mech-template-note__icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
}
.mech-template-note__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--mech-fg);
}
.mech-template-note__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--mech-muted);
}
.mech-template-note__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 2px;
}
// A quiet text action, like the toolbar's "Reload" / "Keep mine": black stays
// reserved for primary actions.
.mech-template-note__action {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--mech-accent);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}
</style>
