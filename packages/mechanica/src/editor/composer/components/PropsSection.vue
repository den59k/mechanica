<template>
  <div class="mech-composer__props">
    <div class="mech-composer__section-title">Variables</div>
    <p v-if="!store.props.length" class="mech-composer__props-empty">
      Click the ⚡ next to any field to turn it into an editable block prop.
    </p>
    <div v-for="prop in store.props" :key="prop.name" class="mech-composer__var">
      <VIcon name="bolt" class="mech-composer__var-bolt" />
      <input
        class="mech-composer__var-name"
        :value="prop.name"
        :aria-label="`Rename ${prop.name}`"
        @change="rename(prop.name, ($event.target as HTMLInputElement).value)"
      />
      <span class="mech-composer__var-type">{{ typeLabel(prop.schema) }}</span>
      <input
        class="mech-composer__var-default"
        :value="defaultOf(prop.schema)"
        placeholder="default"
        :aria-label="`Default for ${prop.name}`"
        @input="store.setPropDefault(prop.name, ($event.target as HTMLInputElement).value)"
      />
      <button type="button" class="mech-composer__var-remove" title="Remove variable" @click="store.unexposeProp(prop.name)">
        <VIcon name="trash" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import VIcon from '../../components/VIcon.vue'

const store = inject(composerStoreKey)!

const rename = (from: string, to: string) => {
  store.renameProp(from, to) // a rejected rename simply re-renders the unchanged name
}

const typeLabel = (schema: Record<string, unknown>) => {
  if (schema.format === 'image') return 'image'
  if (schema.format === 'smartLink') return 'link'
  if (schema.format === 'text') return 'text'
  return String(schema.type ?? 'string')
}
const defaultOf = (schema: Record<string, unknown>) => {
  const d = schema.default
  return d == null ? '' : String(d)
}
</script>
