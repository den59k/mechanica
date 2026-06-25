<template>
  <div class="mech-collapse" :class="{ 'is-open': open }">
    <div class="mech-collapse__head">
      <slot name="lead" />
      <button type="button" class="mech-collapse__toggle" @click="open = !open">
        <VIcon name="chevron-down" class="mech-collapse__chevron" />
        <span class="mech-collapse__title">{{ title }}</span>
        <span v-if="badge !== undefined && badge !== ''" class="mech-collapse__badge">{{ badge }}</span>
      </button>
      <div v-if="$slots.actions" class="mech-collapse__actions"><slot name="actions" /></div>
    </div>
    <div v-show="open" class="mech-collapse__body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import VIcon from '../components/VIcon.vue'

// The single disclosure primitive behind every nested object and array field.
// `lead` (e.g. a drag grip) sits before the toggle, `actions` (e.g. remove)
// after it; the default slot is the collapsible body.
const props = withDefaults(
  defineProps<{ title?: string; badge?: number | string; defaultOpen?: boolean }>(),
  { defaultOpen: true },
)
const open = ref(props.defaultOpen)
</script>
