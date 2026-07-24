import { inject, isReactive, shallowReactive } from 'vue'
import { unfoldSchema, type SchemaItem, type SchemaType } from 'compact-json-schema'
import { passDefaultValue } from 'mechanica-shared'
import { mechanicaKey } from './state'
import { registerDataEntry } from './data-registry'

export interface DataDefinition<Id extends string, T extends SchemaItem> {
  /** Unique data id. */
  id: Id
  /** Display title in the editor. */
  title?: string
  /** Data shape (compact-json-schema). */
  props: T
  /**
   * Restrict the entry to pages under this folder (a folder path relative to
   * `pages/`, e.g. `'examples'`; nested folders match by prefix). Omitted =
   * offered everywhere. This only filters where the editor's Data dialog offers
   * the entry — the value's scope (site / folder / page, chosen per page) and
   * where it is stored are unchanged.
   */
  folder?: string
  /**
   * Store this entry's site/folder value per locale on a multi-language site
   * (with fallback to the default locale), so shared strings can be translated.
   * Ignored when i18n is off.
   */
  localized?: boolean
}

export interface DataHook<Id extends string, T extends SchemaItem> {
  (): SchemaType<T>
  /** The data id (used by query composables). */
  id: Id
  toJSON(): { id: Id }
}

/**
 * Declare shared data. An **imported function** (not a macro) used in a
 * standalone data module; returns a hook components call to read the data. The
 * value's scope (site / folder / page) is chosen per page in the editor, not here.
 *
 *   // data/header.ts
 *   export const useHeader = defineData({ id: 'header', props: {...} })
 */
export function defineData<Id extends string, T extends SchemaItem>(
  definition: DataDefinition<Id, T>,
): DataHook<Id, T> {
  registerDataEntry(definition)

  const hook = (() => {
    const ctx = inject(mechanicaKey)
    if (!ctx) throw new Error(`[mechanica] data hook "${definition.id}" used outside a Mechanica app`)

    // In the editor, keep values aligned with the (possibly changing) schema.
    if (ctx.mode === 'dev') {
      ctx.data[definition.id] = passDefaultValue(ctx.data[definition.id], unfoldSchema(definition.props))
    }

    const value = ctx.data[definition.id]
    if (ctx.mode === 'server') return value as SchemaType<T>

    if (!isReactive(value)) {
      const reactive = shallowReactive((value ?? {}) as object)
      ctx.data[definition.id] = reactive
      return reactive as SchemaType<T>
    }
    return value as SchemaType<T>
  }) as DataHook<Id, T>

  hook.id = definition.id
  hook.toJSON = () => ({ id: definition.id })
  return hook
}
