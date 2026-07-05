<template>
  <!-- An optional inspector property, shown as a switch row. Off = collapsed and
       its data cleared; flipping it on activates the property and expands the
       editor beneath. Discoverable at a glance — every property a node *can*
       carry is listed, none hidden behind a menu. -->
  <div class="mech-composer__prop2" :class="{ 'is-active': active, 'is-overridden': overridden }">
    <div class="mech-composer__prop2-head">
      <button type="button" class="mech-composer__prop2-toggle" :aria-pressed="active" @click="emit('toggle')">
        <VIcon v-if="icon" :name="icon" class="mech-composer__prop2-icon" />
        <span class="mech-composer__prop2-title">{{ title }}</span>
        <span class="mech-composer__switch" :class="{ 'is-on': active }" aria-hidden="true">
          <span class="mech-composer__switch-knob" />
        </span>
      </button>
      <button
        v-if="active && overridden"
        type="button"
        class="mech-composer__prop2-reset"
        title="Reset this breakpoint override"
        @click="emit('reset')"
      >
        <VIcon name="undo" />
      </button>
    </div>
    <div v-if="active" class="mech-composer__prop2-body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import VIcon from '../../components/VIcon.vue'

defineProps<{
  title: string
  /** Leading VIcon name (muted) — aids scanning the property list. */
  icon?: string
  /** On = property active (data may be written) + body expanded. */
  active: boolean
  /** The current (non-base) breakpoint overrides this property. */
  overridden?: boolean
}>()
const emit = defineEmits<{ toggle: []; reset: [] }>()
</script>
