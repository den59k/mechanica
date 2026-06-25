import { registerFieldEditor } from './registry'
import StringField from './editors/StringField.vue'
import TextField from './editors/TextField.vue'
import NumberField from './editors/NumberField.vue'
import BooleanField from './editors/BooleanField.vue'
import EnumField from './editors/EnumField.vue'
import ColorField from './editors/ColorField.vue'
import ImageField from './editors/ImageField.vue'
import SmartLinkField from './editors/SmartLinkField.vue'
import MultiselectField from './editors/MultiselectField.vue'
import RichTextField from './editors/RichTextField.vue'

/** Register the editor components for the built-in field types. */
export function registerBuiltinFieldEditors(): void {
  // primitives
  registerFieldEditor('string', StringField)
  registerFieldEditor('text', TextField)
  registerFieldEditor('number', NumberField)
  registerFieldEditor('integer', NumberField)
  registerFieldEditor('boolean', BooleanField)
  // enum → dropdown (checked before `type` in resolveFieldEditor)
  registerFieldEditor('enum', EnumField)
  // formats
  registerFieldEditor('color', ColorField)
  registerFieldEditor('image', ImageField)
  registerFieldEditor('smartLink', SmartLinkField)
  registerFieldEditor('multiselect', MultiselectField)
  registerFieldEditor('richText', RichTextField)
}
