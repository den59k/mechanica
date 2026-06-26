<template>
  <VDialog :title="title" size="standard">
    <p class="mech-confirm__message">{{ message }}</p>
    <template #actions>
      <button type="button" class="mech-button" @click="dialog.back()">{{ cancelLabel }}</button>
      <button
        type="button"
        class="mech-button"
        :class="danger ? 'is-danger' : 'is-primary'"
        @click="onConfirmClick"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </VDialog>
</template>

<script setup lang="ts">
import VDialog from '../ui/VDialog.vue'
import { useDialog } from '../ui/dialog'

const props = withDefaults(
  defineProps<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void
  }>(),
  { confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false },
)

const dialog = useDialog()
const onConfirmClick = () => {
  dialog.back()
  props.onConfirm()
}
</script>

<style lang="scss" scoped>
.mech-confirm__message {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--mech-fg-alt);
}
</style>
