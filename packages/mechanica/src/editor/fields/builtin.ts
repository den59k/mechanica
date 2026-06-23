import { registerFieldEditor } from './registry'
import StringField from './editors/StringField.vue'
import TextField from './editors/TextField.vue'
import NumberField from './editors/NumberField.vue'
import BooleanField from './editors/BooleanField.vue'
import ColorField from './editors/ColorField.vue'

/** Register the editor components for the built-in primitive/field types. */
export function registerBuiltinFieldEditors(): void {
  registerFieldEditor('string', StringField)
  registerFieldEditor('text', TextField)
  registerFieldEditor('number', NumberField)
  registerFieldEditor('integer', NumberField)
  registerFieldEditor('boolean', BooleanField)
  registerFieldEditor('color', ColorField)
}
