export {
  mechanica,
  BLOCKS_MODULE_ID,
  CLIENT_MODULE_ID,
  WIDGETS_MODULE_ID,
  type MechanicaPluginOptions,
} from './plugin'
export { type PageProvider, type PageProviderCtx } from './generate-pages'
export { default as svgGlob } from '../svg-plugin'
export { collectBlocks } from './collect-blocks'
export { collectWidgets } from './collect-widgets'
export {
  generateClientEntry,
  generateSsrEntry,
  type ClientEntryOptions,
  type SsrEntryOptions,
} from './entries'
