<template>
  <VDialog title="Page data" size="wide">
    <DataSettings />
    <template #actions>
      <button type="button" class="mech-button is-primary" @click="dialog.back()">Done</button>
    </template>
  </VDialog>
</template>

<script setup lang="ts">
import VDialog from '../ui/VDialog.vue'
import { useDialog } from '../ui/dialog'
import DataSettings from '../components/DataSettings.vue'

const dialog = useDialog()
</script>
