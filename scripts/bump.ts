// `bun run release:bump <version> [--create <version>]` — set the release
// version everywhere it lives.
//
// `mechanica` and `mechanica-shared` share a version, and `bun.lock` mirrors
// each workspace's version: `bun install` doesn't refresh those mirrors after
// a version-only change, yet packing reads `workspace:*` versions from them,
// so they are rewritten here too. `--create` also bumps `create-mechanica`
// (it has its own version; bump it only when the scaffolder or its template
// changed) and points the template at the new `mechanica`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

const args = process.argv.slice(2)
const createFlag = args.indexOf('--create')
const createVersion = createFlag === -1 ? undefined : args[createFlag + 1]
const version = args.find((arg, index) => !arg.startsWith('--') && index !== createFlag + 1)

if (!version || !SEMVER.test(version) || (createFlag !== -1 && !SEMVER.test(createVersion ?? ''))) {
  console.error('Usage: bun run release:bump <version> [--create <create-mechanica version>]')
  process.exit(1)
}

/** Replace the first match in a file; the pattern must be there. */
function patch(file: string, pattern: RegExp, replacement: string) {
  const target = path.join(root, file)
  const source = fs.readFileSync(target, 'utf8')
  if (!pattern.test(source)) throw new Error(`${file}: nothing matches ${pattern}`)
  fs.writeFileSync(target, source.replace(pattern, replacement))
}

const VERSION_FIELD = /("version": ")[^"]+(")/
const lockEntry = (dir: string) => new RegExp(`("packages/${dir}": \\{\\s*"name": "[^"]+",\\s*"version": ")[^"]+(")`)

const bumps: [dir: string, version: string][] = [
  ['shared', version],
  ['mechanica', version],
]
if (createVersion) bumps.push(['create-mechanica', createVersion])

for (const [dir, next] of bumps) {
  patch(`packages/${dir}/package.json`, VERSION_FIELD, `$1${next}$2`)
  patch('bun.lock', lockEntry(dir), `$1${next}$2`)
  console.log(`packages/${dir} → ${next}`)
}

// A prerelease goes to npm's `next` tag, which a caret range never resolves.
if (createVersion && !version.includes('-')) {
  patch('packages/create-mechanica/template/package.json', /("mechanica": ")[^"]+(")/, `$1^${version}$2`)
  console.log(`template → mechanica ^${version}`)
}

console.log(
  [
    '',
    'Next:',
    `  1. Add a "## ${version}" entry to CHANGELOG.md`,
    '  2. bun run release:check',
    `  3. Commit and push, then publish: gh release create v${version} --title "v${version}" --notes "See CHANGELOG.md"`,
    '',
  ].join('\n'),
)
