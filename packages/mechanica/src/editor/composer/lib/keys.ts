import type { InjectionKey } from 'vue'
import type { ComposerStore } from './composer-store'
import type { ComposerHistory } from './composer-history'
import type { LayerDnd } from './use-layer-dnd'
import type { InsertDnd } from './use-insert-dnd'

/** Reactive composer store, provided by `ComposerApp`. */
export const composerStoreKey: InjectionKey<ComposerStore> = Symbol('composer-store')
/** Undo/redo controller. */
export const composerHistoryKey: InjectionKey<ComposerHistory> = Symbol('composer-history')
/** Layers-tree drag-and-drop controller. */
export const composerLayerDndKey: InjectionKey<LayerDnd> = Symbol('composer-layer-dnd')
/** Drag-to-insert (palette → canvas) controller. */
export const composerInsertDndKey: InjectionKey<InsertDnd> = Symbol('composer-insert-dnd')
