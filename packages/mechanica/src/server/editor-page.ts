import fs from 'node:fs'
import { join } from 'node:path'
import {
  EDITOR_DIST_DIR,
  passDataToHTML,
  serializeState,
  type EditorHostConfig,
  type SiteManifest,
  type State,
} from 'mechanica-shared'

export interface EditablePageOptions {
  /** The site's url/name, for `{{ site.* }}` head templating. */
  site?: SiteManifest['site']
  /** Sets `window.__MECHANICA_EDITOR__` — how this host configures the editor. */
  hostConfig?: EditorHostConfig
  /** Extra markup placed right after the state script (dev: the module script that boots the page). */
  scripts?: string
}

/**
 * Turn the site's `index.html` into an editable page: resolve the `{{ … }}`
 * head placeholders against the page's data — the same pass the export runs —
 * and inject `window.state` at the top of `<body>`, ahead of any module script.
 * One function for every host: the dev server feeds it the source `index.html`,
 * a hosted editor the built `dist/mechanica-editor/index.html`.
 */
export function renderEditablePage(html: string, state: State, options: EditablePageOptions = {}): string {
  // Template before injecting the state script (whose JSON must not be touched).
  const templated = passDataToHTML(html, {
    ...state.data,
    site: { url: options.site?.url, name: options.site?.name },
    page: state.page,
  })
  const inject = [
    ...(options.hostConfig
      ? [`<script>window.__MECHANICA_EDITOR__=${serializeState(options.hostConfig as never)}</script>`]
      : []),
    `<script>window.state=${serializeState(state)}</script>`,
    ...(options.scripts ? [options.scripts] : []),
  ].join('\n')
  return templated.replace('<body>', `<body>\n${inject}`)
}

/**
 * The page template of an editor build (`mechanica build --editor`), or null
 * when `distDir` holds none. Its sibling files in `dist/mechanica-editor/` are
 * the static root of the editing origin.
 */
export function readEditorTemplate(distDir: string): string | null {
  const file = join(distDir, EDITOR_DIST_DIR, 'index.html')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null
}
