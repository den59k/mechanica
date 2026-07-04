<template>
  <div class="mech-composer__insert">
    <div class="mech-composer__section-title">Insert</div>
    <div class="mech-composer__insert-grid">
      <button
        v-for="el in ELEMENTS"
        :key="el.blockId"
        type="button"
        class="mech-composer__insert-card"
        :title="el.container ? `${el.label} (container)` : el.label"
        @click="store.addElement(el.blockId)"
      >
        <VIcon :name="el.icon" />
        <span>{{ el.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import { ELEMENTS } from '../lib/elements-meta'
import VIcon from '../../components/VIcon.vue'

const store = inject(composerStoreKey)!
</script>
