import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * This package's version, read from its own `package.json` — found by walking
 * up from this module, which sits at a different depth in `src/` and in the
 * built `dist/` (and its chunks).
 */
export function engineVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      if (pkg.name === 'mechanica' && typeof pkg.version === 'string') return pkg.version
    } catch {
      // No package.json at this level — keep climbing.
    }
    dir = dirname(dir)
  }
  throw new Error('Could not determine the mechanica version')
}
