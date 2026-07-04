<template>
  <div class="mech-composer__bindfield">
    <span v-if="bound" class="mech-composer__bind-chip" :title="`Bound to prop “${bound}”`">
      <VIcon name="bolt" />
      <span class="mech-composer__bind-name">{{ bound }}</span>
      <button type="button" class="mech-composer__bind-x" title="Unbind (make a fixed value)" @click="unbind">
        <VIcon name="close" />
      </button>
    </span>
    <slot v-else />
    <button
      v-if="!bound"
      type="button"
      class="mech-composer__bind-btn"
      title="Expose as a block prop"
      @click="expose"
    >
      <VIcon name="bolt" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import VIcon from '../../components/VIcon.vue'

const props = defineProps<{
  nodeId: string
  fieldKey: string
  schema: Record<string, unknown>
  /** Suggested prop name (deduped by the store). */
  name?: string
}>()

const store = inject(composerStoreKey)!
const bound = computed(() => store.boundPropOf(props.nodeId, props.fieldKey))
const expose = () => store.exposeProp(props.nodeId, props.fieldKey, props.schema, props.name)
const unbind = () => {
  if (bound.value) store.unexposeProp(bound.value)
}
</script>
