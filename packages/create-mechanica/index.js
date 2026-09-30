// The `create-mechanica` scaffolder. Plain Node-compatible JS on purpose:
// `npm create mechanica` runs this under Node (not Bun), so unlike the rest
// of the monorepo it cannot ship Bun-only TS source. Zero dependencies.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'template')

// npm strips `.gitignore` from published packages, so the template ships it
// under a neutral name and we rename on scaffold (same trick as create-vite).
/** @type {Record<string, string>} */
const renameOnCopy = { _gitignore: '.gitignore' }

/**
 * Derive a valid npm package name from a directory name.
 * @param {string} dirName
 * @returns {string}
 */
export function toPackageName(dirName) {
  const name = dirName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]+/, '')
    .replace(/[^a-z0-9-._~]/g, '-')
    .replace(/^-+|-+$/g, '')
  return name || 'mechanica-app'
}

/**
 * The entries of an existing directory that block scaffolding into it.
 * Dotfiles are tolerated — a folder opened in an editor or an AI coding agent
 * usually already holds `.git`, `.claude`, `.vscode`… — except the ones the
 * template writes itself (`.mech`, `.gitignore`): nothing is ever overwritten.
 * @param {string} dir
 * @returns {string[]}
 */
export function blockingEntries(dir) {
  const ours = new Set(fs.readdirSync(templateDir).map((entry) => renameOnCopy[entry] ?? entry))
  return fs.readdirSync(dir).filter((entry) => !entry.startsWith('.') || ours.has(entry))
}

/**
 * Copy the template into `targetDir` and patch the project name.
 * `targetDir` must not exist yet, or hold nothing but dotfiles the template
 * doesn't write (see `blockingEntries`).
 * @param {string} targetDir
 * @param {{ name?: string }} [options]
 * @returns {{ dir: string, name: string }}
 */
export function scaffold(targetDir, options = {}) {
  const dir = path.resolve(targetDir)
  if (fs.existsSync(dir)) {
    if (!fs.statSync(dir).isDirectory()) throw new Error(`${dir} exists and is not a directory.`)
    const blocking = blockingEntries(dir)
    if (blocking.length > 0) {
      const found = blocking.slice(0, 5).join(', ') + (blocking.length > 5 ? ', …' : '')
      throw new Error(`${dir} is not empty (found ${found}) — refusing to scaffold into it.`)
    }
  }
  const name = options.name || toPackageName(path.basename(dir))

  fs.cpSync(templateDir, dir, { recursive: true })
  for (const [from, to] of Object.entries(renameOnCopy)) {
    const source = path.join(dir, from)
    if (fs.existsSync(source)) fs.renameSync(source, path.join(dir, to))
  }

  const manifestPath = path.join(dir, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.name = name
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  return { dir, name }
}

/** @returns {Promise<void>} */
export async function main() {
  let targetDir = process.argv[2]
  if (!targetDir) {
    if (!process.stdin.isTTY) {
      throw new Error('Usage: create-mechanica <project-directory>')
    }
    const readline = await import('node:readline/promises')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    targetDir = (await rl.question('Project directory (mechanica-app): ')).trim() || 'mechanica-app'
    rl.close()
  }

  const { dir, name } = scaffold(targetDir)
  const cdPath = path.relative(process.cwd(), dir) || '.'

  // Mirror whichever package manager invoked us (npm create / bun create / …).
  const agent = process.env.npm_config_user_agent || ''
  const pm = agent.startsWith('bun') ? 'bun' : agent.startsWith('pnpm') ? 'pnpm' : agent.startsWith('yarn') ? 'yarn' : 'npm'

  console.log(`\nScaffolded ${name} in ${dir}\n`)
  console.log('Next steps:\n')
  if (cdPath !== '.') console.log(`  cd ${cdPath}`)
  console.log(`  ${pm} install`)
  console.log(`  ${pm} run dev\n`)
  // Agents read this output too: point them at the project's own guidance.
  console.log(`AI coding agents: read ${path.join(cdPath, 'AGENTS.md')} before editing blocks or pages.\n`)
}
