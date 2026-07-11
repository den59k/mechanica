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
export { Layout, useLayout, resolveLayoutName, type UseLayout } from './layout'
export { renderBlocks } from './render-blocks'
export { loadBlocks, usedBlockIds, type BlockLoader, type BlockLoaders } from './load-blocks'
export { createComposedComponent } from './composed'
export { defineComposer, type ComposerComponentInput, type ComposerInput } from './composer-components'
// Re-exported so the generated `virtual:mechanica/components` module can normalize
// the manifest's classes without a bare `mechanica-shared` import (which a virtual
// module can't resolve in the source-aliased dev app).
export { normalizeClassManifest } from 'mechanica-shared'
export { registerElements, elements, isElementBlock } from '../elements'
export { Link, type LinkTarget } from './link'
export { Image, imagePosition, type ImageValue } from './image'
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
export { usePagination, type UsePaginationFilter, type PaginationResult } from './use-pagination'
export { useFetch, type UseFetchOptions } from './use-fetch'
export { usePageData } from './use-page-data'
export { useLocale, type UseLocale } from './use-locale'

// Context
export {
  mechanicaKey,
  type MechanicaContext,
  type MechanicaMode,
  type BlocksMap,
  type QueryResolver,
} from './state'
