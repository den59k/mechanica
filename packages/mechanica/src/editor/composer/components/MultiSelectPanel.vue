<template>
  <div class="mech-composer__inspector">
    <div class="mech-composer__inspector-head">
      <VIcon name="menu" />
      <span>{{ store.selectedIds.length }} selected</span>
      <button type="button" class="mech-icon-button" title="Clear selection" @click="store.select(null)">
        <VIcon name="close" />
      </button>
    </div>

    <section class="mech-composer__section">
      <div class="mech-composer__multi-list">
        <button
          v-for="node in store.selectedNodes"
          :key="node.id"
          type="button"
          class="mech-composer__multi-row"
          @click="store.select(node.id)"
        >
          <VIcon :name="blockIcon(node)" class="mech-composer__layer-icon" />
          <span>{{ blockLabel(node) }}</span>
        </button>
      </div>
    </section>

    <section class="mech-composer__section mech-composer__multi-actions">
      <button type="button" class="mech-button" @click="store.duplicateSelected()">
        <VIcon name="copy" /> Duplicate
      </button>
      <button type="button" class="mech-button mech-composer__danger" @click="store.removeSelected()">
        <VIcon name="trash" /> Delete
      </button>
    </section>

    <p class="mech-composer__hint">Shift-click an element to add or remove it.</p>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { composerStoreKey } from '../lib/keys'
import { blockIcon, blockLabel } from '../lib/elements-meta'
import VIcon from '../../components/VIcon.vue'

const store = inject(composerStoreKey)!
</script>
