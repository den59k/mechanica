<template>
  <VDialog :title="title">
    <form class="mech-page-form" @submit.prevent="submit">
      <label class="mech-page-form__field">
        <span>Name</span>
        <input
          ref="nameInput"
          v-model="name"
          class="mech-input"
          placeholder="Page name"
          @input="syncPath"
        />
      </label>
      <label class="mech-page-form__field">
        <span>Path</span>
        <input v-model="path" class="mech-input" placeholder="/path" @input="pathTouched = true" />
      </label>
      <p v-if="error" class="mech-page-form__error">{{ error }}</p>
      <div class="mech-page-form__actions">
        <button type="button" class="mech-button" @click="dialog.back()">Cancel</button>
        <button type="submit" class="mech-button is-primary" :disabled="!canSubmit || busy">
          {{ submitLabel }}
        </button>
      </div>
    </form>
  </VDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import VDialog from '../ui/VDialog.vue'
import { useDialog } from '../ui/dialog'
import { pathFromName } from '../lib/page-list'

/**
 * The create / rename / duplicate form, opened by `PagesDialog` as its own
 * small dialog. The owner supplies `onSubmit`, which persists the page and
 * resolves an error message (shown inline) or `null` on success — on success
 * this dialog closes itself.
 */
const props = withDefaults(
  defineProps<{
    mode: 'create' | 'edit' | 'duplicate'
    initialName?: string
    initialPath?: string
    /** Folder prefix for auto-derived paths (the rail's active folder). */
    folder?: string | null
    /** Duplicated page's name, for the dialog title. */
    sourceName?: string
    onSubmit: (input: { name: string; path: string }) => Promise<string | null>
  }>(),
  { initialName: '', initialPath: '', folder: null, sourceName: '' },
)

const dialog = useDialog()
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

const name = ref(props.initialName)
const path = ref(props.initialPath || (props.initialName ? pathFromName(props.initialName, props.folder) : '/'))
// Creating/duplicating: the path follows the name until edited by hand.
const pathTouched = ref(props.mode === 'edit')
const error = ref('')
const busy = ref(false)

function syncPath() {
  if (!pathTouched.value) path.value = pathFromName(name.value, props.folder)
}

const title = computed(() =>
  props.mode === 'duplicate'
    ? `Duplicate “${props.sourceName}”`
    : props.mode === 'edit'
      ? 'Edit page'
      : 'New page',
)
const submitLabel = computed(() =>
  props.mode === 'duplicate' ? 'Duplicate' : props.mode === 'edit' ? 'Save' : 'Create',
)
const canSubmit = computed(() => !!name.value.trim() && path.value.trim().startsWith('/'))

onMounted(() => {
  nameInput.value?.focus()
  nameInput.value?.select()
})

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  error.value = ''
  const result = await props
    .onSubmit({ name: name.value.trim(), path: path.value.trim() })
    .catch(() => 'Could not save the page')
  busy.value = false
  if (result) error.value = result
  else dialog.back()
}
</script>

<style lang="scss" scoped>
.mech-page-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mech-page-form__field {
  display: flex;
  flex-direction: column;
  gap: 5px;

  span {
    font-size: 12px;
    font-weight: 500;
    color: var(--mech-muted);
  }
}
.mech-page-form__error {
  margin: 0;
  color: var(--mech-error);
  font-size: 12px;
}
.mech-page-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
