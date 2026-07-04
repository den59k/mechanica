<template>
  <div ref="rootEl" class="mech-iconfield">
    <button
      type="button"
      class="mech-iconfield__trigger"
      :class="{ 'is-empty': !modelValue }"
      :aria-label="ariaLabel ?? 'Pick an icon'"
      @click="toggle"
    >
      <VIcon :name="modelValue || fallback" class="mech-iconfield__current" />
      <span class="mech-iconfield__name">{{ modelValue || placeholder }}</span>
      <VIcon name="chevron-down" class="mech-iconfield__chevron" />
    </button>

    <VPopover :open="open" :anchor="rootEl" panel-class="mech-iconfield__pop" @update:open="open = $event">
      <div class="mech-iconfield__search">
        <VIcon name="search" />
        <input
          ref="searchEl"
          v-model="query"
          type="text"
          placeholder="Search icons"
          aria-label="Search icons"
          @keydown.enter.prevent="filtered[0] && pick(filtered[0])"
          @keydown.esc.stop.prevent="open = false"
        />
      </div>
      <div class="mech-iconfield__grid">
        <button
          v-for="name in filtered"
          :key="name"
          type="button"
          class="mech-iconfield__cell"
          :class="{ 'is-selected': name === modelValue }"
          :title="name"
          :aria-label="name"
          @click="pick(name)"
        >
          <VIcon :name="name" />
        </button>
        <p v-if="!filtered.length" class="mech-iconfield__empty">No icons match “{{ query }}”</p>
      </div>
      <button v-if="modelValue" type="button" class="mech-iconfield__clear" @click="pick('')">Clear icon</button>
    </VPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { contents } from '../icons?svg-glob'
import VIcon from './VIcon.vue'
import VPopover from './VPopover.vue'

withDefaults(
  defineProps<{
    modelValue?: string
    /** Shown (greyed) when no icon is set. */
    placeholder?: string
    /** Icon rendered in the trigger when the value is empty. */
    fallback?: string
    ariaLabel?: string
  }>(),
  { placeholder: 'Pick an icon', fallback: 'frame' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const names = Object.keys(contents).sort()
const rootEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement>()
const open = ref(false)
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? names.filter((n) => n.includes(q)) : names
})

function toggle() {
  open.value = !open.value
  if (open.value) {
    query.value = ''
    nextTick(() => searchEl.value?.focus())
  }
}
function pick(name: string) {
  emit('update:modelValue', name)
  open.value = false
}
</script>

<style lang="scss" scoped>
.mech-iconfield {
  position: relative;
  flex: 1;
  min-width: 0;
}
.mech-iconfield__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: var(--mech-field-bg);
  padding: 6px 8px 6px 9px;
  font: inherit;
  font-size: 13px;
  color: var(--mech-fg);
  cursor: pointer;
  text-align: left;

  &.is-empty .mech-iconfield__name {
    color: var(--mech-placeholder);
  }
}
.mech-iconfield__current {
  flex: none;
  font-size: 16px;
}
.mech-iconfield__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mech-iconfield__chevron {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--mech-muted);
}

.mech-iconfield__search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 8px;
  color: var(--mech-muted);

  input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 13px;
    color: var(--mech-fg);
    outline: none;
  }
}
.mech-iconfield__grid {
  display: grid;
  grid-template-columns: repeat(6, 34px);
  gap: 2px;
  width: 214px;
}
.mech-iconfield__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--mech-radius-sm);
  background: none;
  color: var(--mech-fg);
  font-size: 16px;
  cursor: pointer;

  &:hover {
    background: var(--mech-hover);
  }
  &.is-selected {
    background: var(--mech-accent-soft);
    color: var(--mech-accent);
  }
}
.mech-iconfield__empty {
  grid-column: 1 / -1;
  margin: 6px 4px;
  color: var(--mech-muted);
  font-size: 12.5px;
}
.mech-iconfield__clear {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 7px;
  border: none;
  border-top: 1px solid var(--mech-border);
  background: none;
  font: inherit;
  font-size: 12.5px;
  color: var(--mech-muted);
  cursor: pointer;

  &:hover {
    color: var(--mech-fg);
  }
}
</style>
