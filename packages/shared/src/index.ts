export type {
  Block,
  ContentBlock,
  DataEntry,
  DataScope,
  PageMeta,
  State,
  PageLink,
} from './types'

export {
  type FieldType,
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

export { migrateContent, findUnknownBlocks } from './migrate'

// The `.page.md` codec is deliberately NOT re-exported here: it pulls in the
// YAML parser, and this barrel is imported by the client runtime — nothing in
// a production page needs to parse pages. Server-side callers (dev store,
// CLI, rich-text codec) import from '@mechanica/shared/page-format'.

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

