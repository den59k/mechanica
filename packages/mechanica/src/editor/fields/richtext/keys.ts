import type { InjectionKey, ShallowRef } from 'vue'
import type { TextEditorRef } from 'vuewrite'

/**
 * The hosting RichTextEditor's vuewrite ref, provided to widget editing
 * components that need deeper editor integration than the `change` event —
 * e.g. the table widget hands it to `TableEditor` so cell edits push onto the
 * document history and deleting the table removes its block. Internal; site
 * widgets should stick to `change` + `useWidgetServices()`.
 */
export const richTextEditorRefKey: InjectionKey<ShallowRef<TextEditorRef | undefined>> =
  Symbol('mech-rte-ref')
