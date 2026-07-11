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
      <div class="mech-composer__row">
        <span>Icon</span>
        <IconField :model-value="store.def.icon ?? ''" @update:model-value="store.setMeta({ icon: $event })" />
      </div>
      <!-- One-off page designs are created hidden; switching this on promotes
           the block to a reusable one offered under "Site blocks" everywhere. -->
      <button
        type="button"
        class="mech-composer__row mech-composer__meta-switch"
        :aria-pressed="!store.def.hidden"
        :title="store.def.hidden ? 'Hidden — a one-off block for its page only' : 'Offered in the page editor’s block palette'"
        @click="store.setMeta({ hidden: !store.def.hidden })"
      >
        <span>Show in palette</span>
        <span class="mech-composer__switch" :class="{ 'is-on': !store.def.hidden }" aria-hidden="true">
          <span class="mech-composer__switch-knob" />
        </span>
      </button>
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
import IconField from '../../components/IconField.vue'
import PropsSection from './PropsSection.vue'

const store = inject(composerStoreKey)!
const value = (event: Event) => (event.target as HTMLInputElement).value
</script>

<style lang="scss" scoped>
// A plain row button hosting the inspector's switch look (the global
// .mech-composer__switch classes) — reads like the PropToggle rows.
.mech-composer__meta-switch {
  padding: 4px 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover .mech-composer__switch:not(.is-on) {
    background: var(--mech-muted);
  }
}
</style>
