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
} from './types'

export { normalizeClassManifest } from './composer-manifest'

export {
  resolveComposedTemplate,
  resolveBindings,
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

