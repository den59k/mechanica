<template>
  <div class="mech-composer__props">
    <div class="mech-composer__section-title">Variables</div>
    <p v-if="!store.props.length" class="mech-composer__props-empty">
      No variables yet. Click the ⚡ next to a field to turn it into an editable block prop.
    </p>
    <div v-for="prop in store.props" :key="prop.name" class="mech-composer__prop">
      <div class="mech-composer__prop-head">
        <VIcon name="bolt" class="mech-composer__prop-icon" />
        <input
          class="mech-composer__prop-name"
          :value="prop.name"
          :aria-label="`Prop name for ${prop.name}`"
          @change="rename(prop.name, ($event.target as HTMLInputElement).value)"
        />
        <span class="mech-composer__prop-type">{{ typeLabel(prop.schema) }}</span>
        <button type="button" class="mech-composer__prop-remove" title="Remove prop" @click="store.unexposeProp(prop.name)">
          <VIcon name="trash" />
        </button>
      </div>
      <input
        class="mech-composer__input mech-composer__prop-default"
        :value="defaultOf(prop.schema)"
        placeholder="Default value"
        @input="store.setPropDefault(prop.name, ($event.target as HTMLInputElement).value)"
      />
    </div>
    <p v-if="store.props.length" class="mech-composer__props-hint">
      These become the block's editable fields on a page.
    </p>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import VIcon from '../../components/VIcon.vue'

const store = inject(composerStoreKey)!

const rename = (from: string, to: string) => {
  if (!store.renameProp(from, to)) {
    // Reverting is handled by re-render (the input rebinds to the unchanged name).
  }
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
