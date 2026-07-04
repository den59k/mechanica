<template>
  <span class="mech-composer__olabel" :class="{ 'is-overridden': overridden }">
    <slot />
    <button
      v-if="overridden"
      type="button"
      class="mech-composer__reset"
      title="Reset this breakpoint override"
      @click.stop.prevent="emit('reset')"
    >
      <VIcon name="undo" />
    </button>
  </span>
</template>

<script setup lang="ts">
import VIcon from '../../components/VIcon.vue'

defineProps<{ overridden: boolean }>()
const emit = defineEmits<{ reset: [] }>()
</script>
