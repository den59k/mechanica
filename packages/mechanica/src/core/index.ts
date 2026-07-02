import './define-block'
import './field-types'

// App wiring
export { createMechanica, type CreateMechanicaOptions } from './create-mechanica'
export {
  defineMechanicaApp,
  createMechanicaApp,
  type MechanicaAppDefinition,
  type CreateMechanicaAppOptions,
} from './define-mechanica-app'

// Data
export { defineData, type DataDefinition, type DataHook } from './define-data'
export { getDataEntries, registerDataEntry, clearDataEntries, type DataEntryInput } from './data-registry'

// Rendering
export { Content } from './content'
export { renderBlocks } from './render-blocks'
export { Link, type LinkTarget } from './link'
export {
  mountPreviewApp,
  buildPreviewContent,
  type BlockPreviewRequest,
  type PreviewSlotEntry,
  type PreviewContent,
  type MountPreviewAppOptions,
  type MountPreviewAppResult,
} from './preview'

// Routing
export { useRouter, useRoute, createRouter, type MechanicaRouter } from './router'

// Composables
export { usePages, type UsePagesFilter, type PageQueryResult } from './use-pages'
export { useFetch, type UseFetchOptions } from './use-fetch'
export { usePageData } from './use-page-data'

// Context
export {
  mechanicaKey,
  type MechanicaContext,
  type MechanicaMode,
  type BlocksMap,
  type QueryResolver,
} from './state'
