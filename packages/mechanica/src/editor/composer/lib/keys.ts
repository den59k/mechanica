import type { InjectionKey } from 'vue'
import type { ComposerStore } from './composer-store'
import type { ComposerHistory } from './composer-history'

/** Reactive composer store, provided by `ComposerApp`. */
export const composerStoreKey: InjectionKey<ComposerStore> = Symbol('composer-store')
/** Undo/redo controller. */
export const composerHistoryKey: InjectionKey<ComposerHistory> = Symbol('composer-history')
