import type { ComposedBlockDefinition, ContentBlock, State } from './types'

/**
 * The editor ⇄ host wire protocol: what the in-page editor sends to, and gets
 * back from, whatever serves the site's `.mech` store — the Vite dev server
 * today, a hosted editing service tomorrow. One description, so the client
 * (`mechanica`'s `editor/lib/backend.ts`) and the server are checked against
 * the same shapes instead of agreeing by convention.
 */

/** The route prefix a host serves the editor API under, unless it says otherwise. */
export const EDITOR_API_BASE = '/@mechanica'

/**
 * The URL prefix uploaded assets are referenced by **in page data**. Unlike the
 * API base this is a persisted format — it is written into `.page.md` files —
 * so every host serves uploads under it and it is never configurable.
 */
export const UPLOADS_PREFIX = '/@mechanica/assets/'

/** What a host can do; the editor hides the surfaces a host doesn't offer. */
export interface EditorCapabilities {
  /** The Block Composer (create / edit / delete composed blocks). */
  composer: boolean
}

/**
 * How a host configures the editor it serves — set as
 * `window.__MECHANICA_EDITOR__` before the editor entry runs. Everything is
 * optional: with nothing set the editor talks to the dev server.
 */
export interface EditorHostConfig {
  /** The editor API prefix (default {@link EDITOR_API_BASE}). */
  base?: string
  /** Extra headers sent with every API request (e.g. authorization). */
  headers?: Record<string, string>
  capabilities?: Partial<EditorCapabilities>
}

/** A page row of `GET /pages`. */
export interface EditorPageListing {
  path: string
  name: string
  folderPath?: string | null
  /** A work-in-progress page — hidden from queries and the static export. */
  draft?: boolean
  /** The page's explicit layout — absent for pages on the app's default layout. */
  layout?: string
  /**
   * Locales this logical page has (default + translations), on multi-language
   * sites — for the language coverage badges. Absent when i18n is off.
   */
  locales?: string[]
  /** A programmatically generated page (plugin `generatePages`) — read-only, no file. */
  generated?: boolean
}

/** `GET /state?path=` — a page's state plus the version saves must send back. */
export type EditorPageState = State & { version?: string | null }

/** Which page file a save targets: the logical path and, for a translation, its locale. */
export interface SaveTarget {
  path: string
  locale?: string
}

/** The body of `POST /save`. Data arrives pre-split into its scope buckets. */
export interface SavePageRequest {
  content: ContentBlock[] | unknown[]
  pageData: Record<string, unknown>
  siteData: Record<string, unknown>
  folderData: Record<string, unknown>
  /** `localized` site/folder entries — written to the locale's override file. */
  siteDataI18n: Record<string, unknown>
  folderDataI18n: Record<string, unknown>
  /** The page's layout key (null clears back to the default; base-owned). */
  layout?: string | null
  /** The version the editor loaded — a mismatch on the server is a conflict (409). */
  version?: string | null
  /** Overwrite despite a version mismatch. */
  force?: boolean
}

export interface SavePageResponse {
  success: true
  version: string | null
}

/** The body of the page create / edit / duplicate requests. */
export interface PageFormInput {
  name: string
  path: string
  folderId?: string
}

/** A stored upload: its public src, plus dimensions + LQIP when the host can produce them. */
export interface UploadResult {
  src: string
  previewSrc?: string
  width?: number
  height?: number
}

/** A row of `GET /images` — an image already in the site's asset library. */
export interface ImageListing {
  id: string
  name: string
  src: string
}

/** `GET /composed/get?id=` */
export interface ComposedBlockResponse {
  def: ComposedBlockDefinition
  version: string
}
