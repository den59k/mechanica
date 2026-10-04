export type {
  Block,
  ContentBlock,
  ComposedBlockDefinition,
  ComposerComponentDefinition,
  ComposerComponentEntry,
  ComposerManifest,
  ComposerClassDefinition,
  ComposerClassEntry,
  ComposerClassDef,
  ComposerElementKind,
  ComposerBreakpoints,
  PropBinding,
  DataEntry,
  DataScope,
  PageMeta,
  State,
  PageLink,
  VirtualPage,
} from './types'

export {
  EDITOR_API_BASE,
  UPLOADS_PREFIX,
  LEGACY_UPLOADS_PREFIX,
  uploadNameOf,
  type EditorCapabilities,
  type EditorHostConfig,
  type EditorHostApi,
  type EditorPageListing,
  type EditorPageState,
  type SaveTarget,
  type SavePageRequest,
  type SavePageResponse,
  type PageFormInput,
  type UploadResult,
  type ImageListing,
  type ComposedBlockResponse,
} from './editor-protocol'

export { SITE_MANIFEST_FILE, EDITOR_DIST_DIR, type SiteManifest } from './site-manifest'

export { normalizeClassManifest } from './composer-manifest'

export {
  normalizeLocales,
  isLocale,
  parseLocalePath,
  localePath,
  localeLabel,
  type LocalesConfig,
  type LocalesOption,
} from './locale'

export {
  resolveComposedTemplate,
  resolveBindings,
  lookupBinding,
  templateBlockIds,
  isBinding,
} from './compose'

export {
  type FieldType,
  type ImageCropConfig,
  type RegisterAlias,
  builtinFields,
  registerFieldSchemas,
  getFieldDefault,
  areFieldSchemasRegistered,
} from './fields'

export {
  getDefaultValue,
  passDefaultValue,
  buildPreviewData,
  mergePreviewData,
  walkTree,
  walkSchema,
  getValueByPath,
} from './schema'

export {
  generatePage,
  generateProject,
  passDataToHTML,
  serializeState,
  type GeneratePageOptions,
  type GenerateProjectOptions,
  type PageState,
  type RenderResult,
} from './generate-page'

export {
  validateLinks,
  collectInternalLinks,
  normalizeInternalUrl,
  type LinkIssue,
} from './validate-links'

export {
  pageUrl,
  paginationVariantPath,
  applySeoTags,
  auditPageHtml,
  buildSitemap,
  buildRobotsTxt,
  type SeoTagOptions,
  type SitemapEntry,
} from './seo'

export { migrateContent, findUnknownBlocks } from './migrate'

export {
  mergeTranslation,
  diffTranslation,
  mergeValue,
  diffValue,
  mergeBlocks,
  diffBlocks,
  deepEqual,
  type TranslationDoc,
} from './translation'

// The `.page.md` codec is deliberately NOT re-exported here: it pulls in the
// YAML parser, and this barrel is imported by the client runtime — nothing in
// a production page needs to parse pages. Server-side callers (dev store,
// CLI, rich-text codec) import from 'mechanica-shared/page-format'.

export {
  parseQueryKey,
  isPaginatedQuery,
  resolvePagesQuery,
  resolveQueryKey,
  type QuerySource,
  type QueryContext,
  type PageQueryItem,
  type PagesQueryArgs,
  type PaginatedPagesResult,
} from './query-engine'

