<template>
  <div class="mech-composer__settings">
    <div class="mech-composer__inspector-head">
      <VIcon :name="store.def.icon || 'frame'" />
      <span>Block settings</span>
    </div>

    <section class="mech-composer__section">
      <label class="mech-composer__row">
        <span>Name</span>
        <input
          class="mech-composer__input"
          :value="store.def.name"
          placeholder="Block name"
          @input="store.setMeta({ name: value($event) })"
        />
      </label>
      <label class="mech-composer__row">
        <span>Category</span>
        <input
          class="mech-composer__input"
          :value="store.def.category ?? ''"
          placeholder="Site blocks"
          @input="store.setMeta({ category: value($event) })"
        />
      </label>
      <label class="mech-composer__row">
        <span>Icon</span>
        <input
          class="mech-composer__input"
          :value="store.def.icon ?? ''"
          placeholder="Icon name"
          @input="store.setMeta({ icon: value($event) })"
        />
      </label>
    </section>

    <PropsSection />

    <button type="button" class="mech-composer__root-link" @click="store.select(store.rootId)">
      <VIcon name="frame" />
      <span>Edit root layout</span>
      <VIcon name="chevron-down" class="mech-composer__root-link-arrow" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import VIcon from '../../components/VIcon.vue'
import PropsSection from './PropsSection.vue'

const store = inject(composerStoreKey)!
const value = (event: Event) => (event.target as HTMLInputElement).value
</script>
