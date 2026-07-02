import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Recursively list `.ts`/`.js` files under `dir` in stable (sorted) order. */
function listModuleFiles(dir: string): string[] {
  const found: string[] = []
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|js|mts|mjs)$/.test(entry.name)) found.push(full)
    }
  }
  walk(dir)
  return found.sort()
}

/**
 * Generate the source of the `virtual:mechanica/widgets` module: it imports the
 * default export of every `defineWidget` module under `widgetsDir` and exposes
 * them as `widgetsList`. Imported only by the editor entry, so widget editing
 * components never reach the site build.
 *
 * @param resolve Plugin-context resolver, used so each import id is the id Vite
 *                will actually load.
 */
export async function collectWidgets(
  widgetsDir: string,
  resolve: (id: string) => Promise<{ id: string } | null>,
): Promise<string> {
  const imports: string[] = []
  const names: string[] = []

  let index = 0
  for (const file of listModuleFiles(widgetsDir)) {
    const source = readFileSync(file, 'utf-8')
    if (!source.includes('defineWidget')) continue

    const resolved = await resolve(file)
    if (!resolved) continue

    imports.push(`import widget${index} from ${JSON.stringify(resolved.id)}`)
    names.push(`widget${index}`)
    index++
  }

  return [...imports, `export const widgetsList = [${names.join(', ')}]`, ''].join('\n')
}
