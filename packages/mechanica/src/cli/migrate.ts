import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LEGACY_UPLOADS_PREFIX, UPLOADS_PREFIX } from 'mechanica-shared'

export interface MigrateOptions {
  /** Project root (defaults to the current working directory). */
  cwd?: string
}

/** The content files a reference to an upload can sit in. */
const isContentFile = (file: string): boolean =>
  /\.(md|yml|json)$/.test(file) && !/^(assets|thumbs|shots)\//.test(file) && file !== 'images.json'

/**
 * Rewrite a content file's text to the current format; returns it unchanged
 * when there is nothing to do. Today that is one thing: uploads are referenced
 * as `/media/<file>`, no longer by the dev-server route they used to live at.
 */
export function migrateContentText(text: string): string {
  return text.replaceAll(LEGACY_UPLOADS_PREFIX, UPLOADS_PREFIX)
}

/**
 * `mechanica migrate` — bring the project's `.mech` content up to the current
 * format, in place. Old content keeps working without it (the old upload
 * prefix is still read everywhere); this only makes the files uniform. Returns
 * the files it changed, relative to `.mech`.
 */
export async function runMigrate(options: MigrateOptions = {}): Promise<string[]> {
  const mechDir = join(options.cwd ?? process.cwd(), '.mech')
  const files = ((await readdir(mechDir, { recursive: true }).catch(() => [])) as string[])
    .map((file) => file.replace(/\\/g, '/'))
    .filter(isContentFile)

  const changed: string[] = []
  for (const file of files) {
    const path = join(mechDir, file)
    const text = await readFile(path, 'utf-8').catch(() => null)
    if (text == null) continue
    const next = migrateContentText(text)
    if (next === text) continue
    await writeFile(path, next)
    changed.push(file)
    console.info(`✓ ${file}`)
  }
  console.info(
    changed.length
      ? `Updated ${changed.length} file(s): uploads are now referenced as ${UPLOADS_PREFIX}<file>`
      : 'Nothing to migrate — the content is already in the current format',
  )
  return changed
}
