import { inject } from 'vue'
import { dialogKey } from './ui/dialog'
import ImagePickerDialog from './dialogs/ImagePickerDialog.vue'
import type { RichTextWidget } from './fields/richtext/widgets'

export type { RichTextWidget }

/**
 * Declare a custom rich-text widget — a block that flows inside `richText`
 * fields (embed, table, CTA button, …). An ordinary imported function, like
 * `defineFieldType`: it only brands the object for the collector.
 *
 * Put each widget in `src/widgets/*.ts` (default export); the Vite plugin
 * gathers them into the editor's Insert menu. The widget's `editor` component
 * is dev-only — it never ships in the site build. On disk the block persists
 * through `vuewrite/markdown`'s generic forms (`<type attr="…"/>`, `:::type`
 * fences), so keep extra block fields flat strings/booleans.
 *
 * Rendering on the page stays yours: add a `#<type>` slot to the `TextViewer`
 * your site renders rich text with.
 */
export function defineWidget(definition: RichTextWidget): RichTextWidget {
  return definition
}

/** The editor services available to widget editing components. */
export interface WidgetServices {
  /** Upload a file to the project's assets, resolving to its public src. */
  uploadFile: ((file: File) => Promise<{ src: string; previewSrc?: string }>) | null
  /** Open the project image picker (library + upload); `onSelect` gets the choice. */
  pickImage: (onSelect: (value: { src: string }) => void) => void
}

/**
 * Access editor services from inside a widget's editing component. The stable,
 * documented surface for widgets — don't reach for the editor's internal
 * provide keys directly.
 */
export function useWidgetServices(): WidgetServices {
  const uploadFile = inject<WidgetServices['uploadFile']>('mechFileUploader', null)
  const dialog = inject(dialogKey, null)
  return {
    uploadFile,
    pickImage: (onSelect) => dialog?.open(ImagePickerDialog, { onSelect }),
  }
}
